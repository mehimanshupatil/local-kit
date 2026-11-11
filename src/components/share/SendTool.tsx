import { useEffect, useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import { useClipboard, useInterval, useLongPress, useNetwork } from '@mantine/hooks';
import { useToolVisit } from '@/stores/toolVisit';
import { usePrefsStore, useToolPrefs } from '@/stores/prefsStore';
import {
  ChatTextIcon, CheckIcon, CopyIcon, DesktopIcon, DeviceMobileIcon, DeviceTabletIcon, DownloadSimpleIcon, EyeSlashIcon,
  FolderOpenIcon, LinkSimpleIcon, PaperPlaneTiltIcon, PencilSimpleIcon, QrCodeIcon, SpinnerIcon, WarningCircleIcon,
  WifiSlashIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { randomDeviceName } from '@/lib/share/names';
import { MAX_NAME_LENGTH, cleanName, thisDevice, type DeviceKind, type Profile } from '@/lib/share/device';
import {
  createShareSession, type IncomingOffer, type IncomingTextOffer, type OutgoingTransfer, type Peer, type ShareSession,
  type TransferEnd,
} from '@/lib/share/session';
import { MAX_TEXT_LENGTH, linkify } from '@/lib/share/text';
import { secretFromHash } from '@/lib/share/pairing';
import PairDialog, { type PairTab, type PairingState } from './PairDialog';
import { canSaveToDisk, isMobileDevice, memorySinks, pickFolderSinks, type SinkFactory } from '@/lib/share/sinks';
import { SpeedMeter, batchProgress, planReceive, type BatchProgress, type ReceivePlan } from '@/lib/share/transfer';

type Connection =
  | { status: 'connecting' }
  | { status: 'ready' }
  /** "Visible to others" is off. */
  | { status: 'hidden' }
  /** No network when the page tried to connect. */
  | { status: 'offline' }
  | { status: 'error'; message: string };

type TransferStatus = 'waiting' | 'active' | 'done' | 'declined' | 'cancelled' | 'cancelled-by-peer' | 'error';

interface Transfer {
  id: string;
  direction: 'out' | 'in';
  peerName: string;
  files: { name: string; size: number }[];
  status: TransferStatus;
  progress: BatchProgress;
  speed: number;
  error?: string;
  /** Folder the files were streamed into, when saved straight to disk. */
  savedTo?: string;
}

type Prompt =
  | { kind: 'files'; offer: IncomingOffer; plan: ReceivePlan }
  | { kind: 'text'; offer: IncomingTextOffer };

/** A text message sent or received. */
interface Note {
  id: string;
  direction: 'out' | 'in';
  peerName: string;
  status: TransferStatus;
  text: string | null;
  error?: string;
}

/** Files answer with where to write them; text answers with `true`; null declines. */
type Answer = SinkFactory | true | null;

/** Live byte counts, updated per chunk and copied into state on a timer. */
interface LiveProgress {
  sizes: number[];
  fileIndex: number;
  fileBytes: number;
  meter: SpeedMeter;
}

// One name per page load even if localStorage is unavailable, so a remount doesn't rename this device
let fallbackName: string | null = null;

const SHARE_PREFS = { deviceName: '', visible: true };

/**
 * Saved prefs as they are right now. During hydration React renders with the
 * store's server snapshot (the defaults), so effects that run on mount must not
 * trust `prefs` from render — a hidden device would briefly join, and a renamed
 * one would get a new random name.
 */
const storedSharePrefs = () => ({ ...SHARE_PREFS, ...usePrefsStore.getState().toolPrefs.share } as typeof SHARE_PREFS);

const PROGRESS_REFRESH_MS = 200;
const PROMPT_FILE_LIMIT = 5;

const isLive = (t: { status: TransferStatus }) => t.status === 'waiting' || t.status === 'active';
const endStatus = (end: TransferEnd): TransferStatus => (end.reason === 'error' ? 'error' : end.reason);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function SendTool() {
  useToolVisit('share', '/share/send');
  const [prefs, setPrefs] = useToolPrefs('share', SHARE_PREFS);
  const { online } = useNetwork();
  // Set on the client only: a stored or random name rendered on the server would never match hydration
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: 'connecting' });
  /** Bumped to rejoin, e.g. when the network comes back. */
  const [attempt, setAttempt] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairTab, setPairTab] = useState<PairTab>('show');
  const [pairing, setPairing] = useState<PairingState>({ step: 'idle' });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [prompts, updatePrompts] = useImmer<Prompt[]>([]);
  const [transfers, updateTransfers] = useImmer<Transfer[]>([]);
  const [received, updateReceived] = useImmer<OutputFile[]>([]);
  const [notes, updateNotes] = useImmer<Note[]>([]);
  const [composeFor, setComposeFor] = useState<Peer | null>(null);

  const session = useRef<ShareSession | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const answers = useRef(new Map<string, (answer: Answer) => void>());
  const outgoing = useRef(new Map<string, OutgoingTransfer>());
  const live = useRef(new Map<string, LiveProgress>());
  /** Folder each incoming transfer is being saved into, when saving to disk. */
  const folderNames = useRef(new Map<string, string>());
  /** Files received so far per incoming transfer (in memory only). */
  const receivedFiles = useRef(new Map<string, File[]>());
  const fileInput = useRef<HTMLInputElement>(null);
  const targetPeer = useRef<Peer | null>(null);

  const updateNote = (id: string, fn: (n: Note) => void) => updateNotes(d => {
    const n = d.find(x => x.id === id);
    if (n) fn(n);
  });

  const updateTransfer = (id: string, fn: (t: Transfer) => void) => updateTransfers(d => {
    const t = d.find(x => x.id === id);
    if (t) fn(t);
  });

  const trackProgress = (id: string, sizes: number[]) => live.current.set(id, { sizes, fileIndex: 0, fileBytes: 0, meter: new SpeedMeter() });

  const recordProgress = (id: string, fileIndex: number, fileBytes: number) => {
    const p = live.current.get(id);
    if (!p) return;
    p.fileIndex = fileIndex;
    p.fileBytes = fileBytes;
    p.meter.record(batchProgress(p.sizes, fileIndex, fileBytes).bytes, performance.now());
  };

  /** Stop tracking and write the final state; `status` is applied unless the transfer already ended. */
  const finishTransfer = (id: string, status: TransferStatus, extra: Partial<Transfer> = {}) => {
    live.current.delete(id);
    updateTransfer(id, t => {
      if (!isLive(t)) return;
      Object.assign(t, extra, { status, speed: 0 });
      if (status === 'done') t.progress = batchProgress(t.files.map(f => f.size), t.files.length, 0);
    });
  };

  useInterval(() => {
    if (live.current.size === 0) return;
    updateTransfers(d => {
      for (const t of d) {
        const p = live.current.get(t.id);
        if (!p || t.status !== 'active') continue;
        t.progress = batchProgress(p.sizes, p.fileIndex, p.fileBytes);
        t.speed = p.meter.bytesPerSecond();
      }
    });
  }, PROGRESS_REFRESH_MS, { autoInvoke: true });

  // Before the join effect below, which reads profileRef
  useEffect(() => {
    const stored = storedSharePrefs().deviceName;
    const name = stored || (fallbackName ??= randomDeviceName());
    if (!stored) setPrefs({ deviceName: name });
    profileRef.current = { name, device: thisDevice() };
    setProfile(profileRef.current);
  }, []);

  useEffect(() => {
    if (online && (connection.status === 'offline' || connection.status === 'error')) setAttempt(a => a + 1);
  }, [online]);

  useEffect(() => {
    let cancelled = false;

    createShareSession(profileRef.current!, {
      onPeersChange: setPeers,
      onConnectionFailed: () => setConnectionFailed(true),
      onPaired: (peer, emojis) => {
        setPairing({ step: 'paired', peer, emojis });
        setPairOpen(true);
      },
      onPairingEnded: reason => setPairing({ step: 'ended', reason }),
      onOffer: offer => new Promise<SinkFactory | null>(resolve => {
        const total = offer.files.reduce((a, f) => a + f.size, 0);
        const plan = planReceive(total, { mobile: isMobileDevice(), canSaveToDisk: canSaveToDisk() });
        answers.current.set(offer.transferId, answer => {
          const sinks = answer === true ? null : answer;
          answers.current.delete(offer.transferId);
          updatePrompts(d => d.filter(p => p.offer.transferId !== offer.transferId));
          if (sinks) {
            const sizes = offer.files.map(f => f.size);
            trackProgress(offer.transferId, sizes);
            updateTransfers(d => {
              d.unshift({
                id: offer.transferId, direction: 'in', peerName: offer.peerName, files: offer.files,
                status: 'active', progress: batchProgress(sizes, 0, 0), speed: 0,
              });
            });
          }
          resolve(sinks);
        });
        updatePrompts(d => { d.push({ kind: 'files', offer, plan }); });
      }),
      onTextOffer: offer => new Promise<boolean>(resolve => {
        answers.current.set(offer.transferId, answer => {
          answers.current.delete(offer.transferId);
          updatePrompts(d => d.filter(p => p.offer.transferId !== offer.transferId));
          if (answer) {
            updateNotes(d => {
              d.unshift({ id: offer.transferId, direction: 'in', peerName: offer.peerName, status: 'active', text: null });
            });
          }
          resolve(answer !== null);
        });
        updatePrompts(d => { d.push({ kind: 'text', offer }); });
      }),
      onText: (transferId, text) => updateNote(transferId, n => {
        n.status = 'done';
        n.text = text;
      }),
      onOfferWithdrawn: transferId => answers.current.get(transferId)?.(null),
      onReceiveProgress: (transferId, { fileIndex, fileBytes }) => recordProgress(transferId, fileIndex, fileBytes),
      onFileReceived: (transferId, _, file) => {
        if (!file) return;
        receivedFiles.current.set(transferId, [...(receivedFiles.current.get(transferId) ?? []), file]);
        updateReceived(d => { d.push({ name: file.name, blob: file, size: file.size }); });
      },
      onReceiveComplete: transferId => {
        const files = receivedFiles.current.get(transferId) ?? [];
        // A single file downloads straight away; several wait in the list for "Download all"
        if (files.length === 1) downloadBlob(files[0], files[0].name);
        finishTransfer(transferId, 'done', { savedTo: folderNames.current.get(transferId) });
        receivedFiles.current.delete(transferId);
        folderNames.current.delete(transferId);
      },
      onReceiveEnded: (transferId, end) => {
        receivedFiles.current.delete(transferId);
        folderNames.current.delete(transferId);
        finishTransfer(transferId, endStatus(end), end.reason === 'error' ? { error: end.message } : {});
      },
    })
      .then(s => {
        if (cancelled) return void s.leave();
        session.current = s;
        setSessionReady(true);
      })
      .catch(e => {
        if (!cancelled) setConnection({ status: 'error', message: e instanceof Error ? e.message : 'Could not start sharing.' });
      });

    return () => {
      cancelled = true;
      for (const answer of answers.current.values()) answer(null);
      for (const t of outgoing.current.values()) t.cancel();
      void session.current?.leave();
      session.current = null;
    };
  }, []);

  // Nearby discovery follows the visibility switch and the network
  useEffect(() => {
    const s = session.current;
    if (!sessionReady || !s) return;
    setConnectionFailed(false);
    if (!storedSharePrefs().visible) {
      void s.setNearby(false);
      return void setConnection({ status: 'hidden' });
    }
    if (!navigator.onLine) return void setConnection({ status: 'offline' });
    setConnection({ status: 'connecting' });
    let stale = false;
    s.setNearby(true)
      .then(() => { if (!stale) setConnection({ status: 'ready' }); })
      .catch(e => {
        if (!stale) setConnection({ status: 'error', message: e instanceof Error ? e.message : 'Could not start sharing.' });
      });
    return () => { stale = true; };
  }, [sessionReady, prefs.visible, attempt]);

  // Opened from a pairing link: pair straight away, and drop the secret from the address bar
  useEffect(() => {
    if (!sessionReady) return;
    const secret = secretFromHash(location.hash);
    if (!secret) return;
    history.replaceState(null, '', location.pathname + location.search);
    setPairTab('enter');
    setPairing({ step: 'joining' });
    setPairOpen(true);
    session.current?.joinPairing({ kind: 'link', secret }).catch(() => setPairing({ step: 'ended', reason: 'failed' }));
  }, [sessionReady]);

  // The other side said the emojis didn't match (or just left) while this side was still checking
  useEffect(() => {
    if (pairing.step === 'paired' && !peers.some(p => p.id === pairing.peer.id)) {
      setPairing({ step: 'mismatch', peerName: pairing.peer.name });
    }
  }, [peers, pairing]);

  const showCode = () => {
    const s = session.current;
    if (!s) return;
    setPairing({ step: 'starting' });
    s.startPairing(location.href)
      .then(invite => setPairing(p => (p.step === 'starting' ? { step: 'showing', invite } : p)))
      .catch(() => setPairing({ step: 'ended', reason: 'failed' }));
  };

  const enterCode = (code: string) => {
    const s = session.current;
    if (!s) return;
    setPairing({ step: 'joining' });
    s.joinPairing({ kind: 'code', code }).catch(() => setPairing({ step: 'ended', reason: 'failed' }));
  };

  const openPairing = () => {
    setPairTab('show');
    setPairOpen(true);
    showCode();
  };

  const changePairTab = (tab: PairTab) => {
    setPairTab(tab);
    session.current?.cancelPairing();
    if (tab === 'show') showCode();
    else setPairing({ step: 'idle' });
  };

  const closePairing = () => {
    // A code nobody has used yet stops working once it's not on screen
    if (pairing.step !== 'paired') session.current?.cancelPairing();
    setPairOpen(false);
    setPairing({ step: 'idle' });
  };

  const rename = (name: string) => {
    const cleaned = cleanName(name);
    if (!cleaned || !profileRef.current) return;
    profileRef.current = { ...profileRef.current, name: cleaned };
    setProfile(profileRef.current);
    setPrefs({ deviceName: cleaned });
    session.current?.updateProfile(profileRef.current);
  };

  const pickFilesFor = (peer: Peer) => {
    targetPeer.current = peer;
    fileInput.current?.click();
  };

  const send = (files: File[]) => {
    const peer = targetPeer.current;
    if (!peer || !session.current || files.length === 0) return;
    const sizes = files.map(f => f.size);
    const transfer = session.current.sendFiles(peer.id, files, ({ fileIndex, fileBytes }) => {
      if (!live.current.has(transfer.transferId)) {
        trackProgress(transfer.transferId, sizes);
        updateTransfer(transfer.transferId, t => { if (t.status === 'waiting') t.status = 'active'; });
      }
      recordProgress(transfer.transferId, fileIndex, fileBytes);
    });
    const id = transfer.transferId;
    outgoing.current.set(id, transfer);
    updateTransfers(d => {
      d.unshift({
        id, direction: 'out', peerName: peer.name, files: files.map(f => ({ name: f.name, size: f.size })),
        status: 'waiting', progress: batchProgress(sizes, 0, 0), speed: 0,
      });
    });
    transfer.done
      .then(result => finishTransfer(id, result === 'sent' ? 'done' : result))
      .catch(e => finishTransfer(id, 'error', { error: e instanceof Error ? e.message : 'The transfer failed.' }))
      .finally(() => outgoing.current.delete(id));
  };

  const cancel = (t: Transfer) => {
    if (t.direction === 'out') outgoing.current.get(t.id)?.cancel();
    else session.current?.cancelReceive(t.id);
  };

  const sendText = (peer: Peer, text: string) => {
    if (!session.current) return;
    const transfer = session.current.sendText(peer.id, text);
    const id = transfer.transferId;
    outgoing.current.set(id, transfer);
    updateNotes(d => { d.unshift({ id, direction: 'out', peerName: peer.name, status: 'waiting', text }); });
    transfer.done
      .then(result => updateNote(id, n => { n.status = result === 'sent' ? 'done' : result; }))
      .catch(e => updateNote(id, n => {
        n.status = 'error';
        n.error = e instanceof Error ? e.message : 'The message failed to send.';
      }))
      .finally(() => outgoing.current.delete(id));
  };

  const prompt = prompts[0] ?? null;

  const answer = (value: Answer) => {
    if (prompt) answers.current.get(prompt.offer.transferId)?.(value);
  };

  const saveToFolder = async () => {
    if (!prompt) return;
    try {
      const { folderName, sinks } = await pickFolderSinks();
      folderNames.current.set(prompt.offer.transferId, folderName);
      answer(sinks);
    } catch {
      // Picker dismissed — leave the prompt open so they can choose again
    }
  };

  const busy = transfers.some(t => t.direction === 'out' && isLive(t));
  const anyLive = busy || transfers.some(isLive) || notes.some(isLive);

  return (
    <div className="space-y-5">
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={e => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          send(files);
        }}
      />

      <Card>
        <CardContent className="pt-5 space-y-4">
          {profile && (
            <Identity
              profile={profile}
              onRename={rename}
              visible={prefs.visible}
              // Hiding leaves the room, which would cut off a transfer in progress
              visibilityLocked={anyLive}
              onVisibleChange={visible => setPrefs({ visible })}
            />
          )}

          {connection.status !== 'hidden' && (
            <p className="text-sm text-muted-foreground">
              Open this page on another device on the same network, then tap it below to send files.
              Right-click or long-press it to send text instead.
            </p>
          )}

          {(!online || connection.status === 'offline') && (
            <Notice icon={WifiSlashIcon} tone="warning">
              You're offline. Finding and connecting to other devices needs an internet connection — this page will
              reconnect when you're back online.
            </Notice>
          )}

          {connection.status === 'hidden' && (
            <Notice icon={EyeSlashIcon}>Hidden. Other devices can't find this one, and it isn't looking for them.</Notice>
          )}

          {connectionFailed && (
            <Notice icon={WarningCircleIcon} tone="warning" onDismiss={() => setConnectionFailed(false)}>
              Found a device but couldn't connect to it directly. Some networks (guest Wi-Fi, VPNs, mobile
              hotspots) block direct connections — try putting both devices on the same Wi-Fi.
            </Notice>
          )}

          {connection.status === 'connecting' && online && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="size-4 animate-spin" /> Connecting…
            </p>
          )}

          {connection.status === 'error' && (
            <Notice icon={WarningCircleIcon} tone="error">{connection.message}</Notice>
          )}

          {connection.status === 'ready' && online && peers.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="size-4 animate-spin" /> Looking for nearby devices…
            </p>
          )}

          {peers.length > 0 && (
            <ul aria-label="Devices" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {peers.map(peer => (
                <li key={peer.id}>
                  <DeviceButton
                    peer={peer}
                    filesBusy={busy}
                    onSendFiles={() => pickFilesFor(peer)}
                    onSendText={() => setComposeFor(peer)}
                  />
                </li>
              ))}
            </ul>
          )}

          {sessionReady && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
              <Button variant="secondary" size="sm" onClick={openPairing}>
                <QrCodeIcon className="size-4" /> Pair a device
              </Button>
              <span className="text-xs text-muted-foreground">Not on the same network? Pair with a QR code or a code.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {notes.map(n => (
        <NoteCard key={n.id} note={n} onCancel={() => outgoing.current.get(n.id)?.cancel()} />
      ))}

      {transfers.map(t => <TransferCard key={t.id} transfer={t} onCancel={() => cancel(t)} />)}

      {received.length > 0 && <OutputFiles files={received} />}

      <AlertDialog open={prompt !== null} onOpenChange={open => { if (!open) answer(null); }}>
        <AlertDialogContent>
          {prompt?.kind === 'files' && (
            <OfferPrompt prompt={prompt} onAccept={() => answer(memorySinks)} onSaveToFolder={saveToFolder} />
          )}
          {prompt?.kind === 'text' && <TextOfferPrompt offer={prompt.offer} onAccept={() => answer(true)} />}
        </AlertDialogContent>
      </AlertDialog>

      <PairDialog
        open={pairOpen}
        tab={pairTab}
        state={pairing}
        onTabChange={changePairTab}
        onClose={closePairing}
        onShowCode={showCode}
        onEnterCode={enterCode}
        onConfirm={closePairing}
        onReject={() => {
          if (pairing.step !== 'paired') return;
          session.current?.unpair(pairing.peer.id);
          setPairing({ step: 'mismatch', peerName: pairing.peer.name });
        }}
      />

      <ComposeDialog
        peer={composeFor}
        onClose={() => setComposeFor(null)}
        onSend={text => {
          if (composeFor) sendText(composeFor, text);
          setComposeFor(null);
        }}
      />
    </div>
  );
}

function OfferPrompt({ prompt: { offer, plan }, onAccept, onSaveToFolder }: {
  prompt: Extract<Prompt, { kind: 'files' }>;
  onAccept: () => void;
  onSaveToFolder: () => void;
}) {
  const total = offer.files.reduce((a, f) => a + f.size, 0);
  const shown = offer.files.slice(0, PROMPT_FILE_LIMIT);
  const hidden = offer.files.length - shown.length;
  const diskOption = (plan.kind === 'memory' && plan.canSaveToDisk) || plan.kind === 'disk-only';

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {offer.peerName} wants to send you {offer.files.length === 1 ? 'a file' : plural(offer.files.length, 'file')}
        </AlertDialogTitle>
        <AlertDialogDescription render={<div />} className="space-y-2">
          <ul className="space-y-0.5 text-left">
            {shown.map((f, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 tabular-nums">{formatFileSize(f.size)}</span>
              </li>
            ))}
            {hidden > 0 && <li>and {plural(hidden, 'more file')}</li>}
          </ul>
          {offer.files.length > 1 && <p className="font-medium text-foreground">{formatFileSize(total)} total</p>}
          {plan.kind === 'disk-only' && (
            <p>That's too much to hold in memory here — save it straight to a folder instead.</p>
          )}
          {plan.kind === 'too-large' && (
            <p className="text-red-600 dark:text-red-400">
              That's more than this browser can receive ({formatFileSize(plan.limit)} limit). To receive larger
              transfers, open this page in Chrome or Edge on a computer and save straight to a folder.
            </p>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Decline</AlertDialogCancel>
        {diskOption && (
          <Button variant={plan.kind === 'disk-only' ? 'default' : 'secondary'} onClick={onSaveToFolder}>
            <FolderOpenIcon className="size-4" /> Save to folder…
          </Button>
        )}
        {plan.kind === 'memory' && <AlertDialogAction onClick={onAccept}>Accept</AlertDialogAction>}
      </AlertDialogFooter>
    </>
  );
}

function statusText(t: Transfer): string | null {
  const them = t.peerName;
  switch (t.status) {
    case 'waiting': return `Waiting for ${them} to accept…`;
    case 'active': return null;
    case 'done':
      if (t.direction === 'out') return `Sent to ${them}.`;
      if (t.savedTo === undefined) return `Received from ${them}.`;
      return t.savedTo ? `Saved to the “${t.savedTo}” folder.` : 'Saved to the folder you chose.';
    case 'declined': return `${them} declined.`;
    case 'cancelled': return 'You cancelled the transfer.';
    case 'cancelled-by-peer': return `${them} cancelled the transfer.`;
    case 'error': return t.error ?? 'The transfer failed.';
  }
}

function TransferCard({ transfer: t, onCancel }: { transfer: Transfer; onCancel: () => void }) {
  const Icon = t.direction === 'out' ? PaperPlaneTiltIcon : DownloadSimpleIcon;
  const total = t.files.reduce((a, f) => a + f.size, 0);
  const label = t.direction === 'out' ? 'Sending' : 'Receiving';
  const text = statusText(t);

  return (
    <Card>
      <CardContent className="pt-5 space-y-3" aria-live="polite" aria-label={`${label} ${t.direction === 'out' ? 'to' : 'from'} ${t.peerName}`}>
        <div className="flex items-center gap-3">
          <Icon className="size-4 text-brand-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {t.direction === 'out' ? `To ${t.peerName}` : `From ${t.peerName}`}
            </p>
            <p className="text-xs text-muted-foreground">{plural(t.files.length, 'file')} · {formatFileSize(total)}</p>
          </div>
          {isLive(t) && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 text-muted-foreground hover:text-red-500">
              <XIcon className="size-3.5" /> Cancel
            </Button>
          )}
        </div>

        {t.status === 'active' && (
          <ProgressBar
            progress={t.progress.overall}
            label={`${label}…${t.speed > 0 ? ` · ${formatFileSize(t.speed)}/s` : ''}`}
          />
        )}
        {text && (
          <p className={t.status === 'error' ? 'text-sm text-red-600 dark:text-red-400' : t.status === 'done' ? 'text-sm text-brand-500' : 'text-sm text-muted-foreground'}>
            {text}
          </p>
        )}

        {t.files.length > 1 && (
          <ul aria-label="Files" className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {t.files.map((f, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                <span className="truncate text-foreground">{f.name}</span>
                <span className="tabular-nums text-muted-foreground">{t.progress.files[i]}%</span>
                <Progress value={t.progress.files[i]} className="col-span-2 h-1" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Tap to send files; right-click (mouse) or long-press (touch) to send text. */
function DeviceButton({ peer, filesBusy, onSendFiles, onSendText }: {
  peer: Peer;
  filesBusy: boolean;
  onSendFiles: () => void;
  onSendText: () => void;
}) {
  // Lifting the finger after a long-press also fires a click, which would open the file picker
  const swallowClick = useRef(false);
  const longPress = useLongPress(() => {
    swallowClick.current = true;
    onSendText();
  }, { events: ['touch'], threshold: 500, cancelOnMove: true, onStart: () => { swallowClick.current = false; } });

  return (
    <button
      type="button"
      {...longPress}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        if (!filesBusy) onSendFiles();
      }}
      onContextMenu={e => {
        e.preventDefault();
        onSendText();
      }}
      aria-disabled={filesBusy || undefined}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-secondary hover:ring-1 hover:ring-brand-500/40 transition-colors select-none [-webkit-touch-callout:none] aria-disabled:opacity-50"
    >
      <DeviceIcon kind={peer.device.kind} className="size-8 text-brand-500" />
      <span className="text-center">
        <span className="block text-sm font-medium text-foreground break-words">{peer.name}</span>
        {peer.device.label && <span className="block text-xs text-muted-foreground">{peer.device.label}</span>}
        {peer.via === 'paired' && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-500">
            <LinkSimpleIcon className="size-3" /> Paired
          </span>
        )}
      </span>
    </button>
  );
}

function ComposeDialog({ peer, onClose, onSend }: {
  peer: Peer | null;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();

  return (
    <Dialog open={peer !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <form
          // min-w-0: the auto-sizing textarea would otherwise widen this grid item to fit a long URL
          className="min-w-0 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!trimmed) return;
            onSend(draft);
            setDraft('');
          }}
        >
          <DialogHeader>
            <DialogTitle>Send text to {peer?.name}</DialogTitle>
            <DialogDescription>They'll be asked to accept it first. Links will be clickable.</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            aria-label="Message"
            value={draft}
            maxLength={MAX_TEXT_LENGTH}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              // Ctrl/Cmd+Enter sends; plain Enter is a new line
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            rows={5}
            className="max-h-64 overflow-y-auto"
            placeholder="Type or paste text or a link…"
          />
          <DialogFooter>
            <Button type="submit" disabled={!trimmed}>
              <PaperPlaneTiltIcon className="size-4" /> Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextOfferPrompt({ offer, onAccept }: { offer: IncomingTextOffer; onAccept: () => void }) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{offer.peerName} wants to send you text</AlertDialogTitle>
        <AlertDialogDescription>{plural(offer.length, 'character')}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Decline</AlertDialogCancel>
        <AlertDialogAction onClick={onAccept}>Accept</AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) => (part.type === 'link'
        ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-500 underline underline-offset-2 break-all">
            {part.value}
          </a>
        )
        : <span key={i}>{part.value}</span>))}
    </>
  );
}

function noteStatus(n: Note): string | null {
  const them = n.peerName;
  switch (n.status) {
    case 'waiting': return `Waiting for ${them} to accept…`;
    case 'active': return 'Receiving…';
    case 'done': return n.direction === 'out' ? `Sent to ${them}.` : null;
    case 'declined': return `${them} declined.`;
    case 'cancelled': return 'You cancelled the message.';
    case 'cancelled-by-peer': return `${them} cancelled the message.`;
    case 'error': return n.error ?? 'The message failed to send.';
  }
}

function NoteCard({ note: n, onCancel }: { note: Note; onCancel: () => void }) {
  const clipboard = useClipboard({ timeout: 2000 });
  const status = noteStatus(n);
  const label = n.direction === 'out' ? `Text to ${n.peerName}` : `Text from ${n.peerName}`;

  return (
    <Card>
      <CardContent className="pt-5 space-y-3" aria-live="polite" aria-label={label}>
        <div className="flex items-center gap-3">
          <ChatTextIcon className="size-4 text-brand-500 shrink-0" />
          <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{label}</p>
          {n.status === 'waiting' && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 text-muted-foreground hover:text-red-500">
              <XIcon className="size-3.5" /> Cancel
            </Button>
          )}
          {n.direction === 'in' && n.text !== null && (
            <Button variant="secondary" size="sm" onClick={() => clipboard.copy(n.text)} className="shrink-0">
              {clipboard.copied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
              {clipboard.copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
        {n.text !== null && (
          <p className={`text-sm whitespace-pre-wrap break-words max-h-80 overflow-y-auto ${n.direction === 'out' ? 'text-muted-foreground line-clamp-3' : 'text-foreground'}`}>
            <LinkedText text={n.text} />
          </p>
        )}
        {status && (
          <p className={n.status === 'error' ? 'text-sm text-red-600 dark:text-red-400' : n.status === 'done' ? 'text-sm text-brand-500' : 'text-sm text-muted-foreground'}>
            {status}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const DEVICE_ICONS = { phone: DeviceMobileIcon, tablet: DeviceTabletIcon, computer: DesktopIcon } as const;

function DeviceIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = DEVICE_ICONS[kind];
  return <Icon className={className} aria-hidden />;
}

const NOTICE_TONES = {
  info: 'text-muted-foreground bg-secondary',
  warning: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  error: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

function Notice({ icon: Icon, tone = 'info', onDismiss, children }: {
  icon: typeof WarningCircleIcon;
  tone?: keyof typeof NOTICE_TONES;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${NOTICE_TONES[tone]}`}>
      <Icon className="size-4 shrink-0 mt-0.5" />
      <p className="flex-1">{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

function Identity({ profile, onRename, visible, visibilityLocked, onVisibleChange }: {
  profile: Profile;
  onRename: (name: string) => void;
  visible: boolean;
  visibilityLocked: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
        <DeviceIcon kind={profile.device.kind} className="size-8 text-brand-500 shrink-0" />
        {editing ? (
          <form
            className="flex flex-1 min-w-0 items-center gap-2"
            onSubmit={e => {
              e.preventDefault();
              onRename(draft);
              setEditing(false);
            }}
          >
            <Input
              autoFocus
              aria-label="Device name"
              value={draft}
              maxLength={MAX_NAME_LENGTH}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 min-w-0"
            />
            <Button type="submit" size="sm" className="shrink-0" disabled={!cleanName(draft)}>Save</Button>
            <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : (
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              You appear as <span className="font-semibold text-foreground break-words">{profile.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Rename this device"
                onClick={() => {
                  setDraft(profile.name);
                  setEditing(true);
                }}
              >
                <PencilSimpleIcon className="size-3.5" />
              </Button>
            </p>
            {profile.device.label && <p className="text-xs text-muted-foreground">{profile.device.label}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch id="share-visible" checked={visible} disabled={visibilityLocked} onCheckedChange={onVisibleChange} />
        <Label htmlFor="share-visible" className="text-sm">Visible to others</Label>
      </div>
    </div>
  );
}
