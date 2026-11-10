import { useEffect, useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import { useInterval } from '@mantine/hooks';
import { useToolVisit } from '@/stores/toolVisit';
import {
  DevicesIcon, DownloadSimpleIcon, FolderOpenIcon, PaperPlaneTiltIcon, SpinnerIcon, WarningCircleIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { randomDeviceName } from '@/lib/share/names';
import {
  joinShareSession, type IncomingOffer, type OutgoingTransfer, type Peer, type ShareSession, type TransferEnd,
} from '@/lib/share/session';
import { canSaveToDisk, isMobileDevice, memorySinks, pickFolderSinks, type SinkFactory } from '@/lib/share/sinks';
import { SpeedMeter, batchProgress, planReceive, type BatchProgress, type ReceivePlan } from '@/lib/share/transfer';

type Connection = { status: 'connecting' } | { status: 'ready' } | { status: 'error'; message: string };

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

interface Prompt {
  offer: IncomingOffer;
  plan: ReceivePlan;
}

/** Live byte counts, updated per chunk and copied into state on a timer. */
interface LiveProgress {
  sizes: number[];
  fileIndex: number;
  fileBytes: number;
  meter: SpeedMeter;
}

// One name per page load, so a remount doesn't make this device show up under a new name
let deviceName: string | null = null;

const PROGRESS_REFRESH_MS = 200;
const PROMPT_FILE_LIMIT = 5;

const isLive = (t: Transfer) => t.status === 'waiting' || t.status === 'active';
const endStatus = (end: TransferEnd): TransferStatus => (end.reason === 'error' ? 'error' : end.reason);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function SendTool() {
  useToolVisit('share', '/share/send');
  // Picked on the client: a server-rendered random name would never match hydration
  const [selfName, setSelfName] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: 'connecting' });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [prompts, updatePrompts] = useImmer<Prompt[]>([]);
  const [transfers, updateTransfers] = useImmer<Transfer[]>([]);
  const [received, updateReceived] = useImmer<OutputFile[]>([]);

  const session = useRef<ShareSession | null>(null);
  const answers = useRef(new Map<string, (sinks: SinkFactory | null) => void>());
  const outgoing = useRef(new Map<string, OutgoingTransfer>());
  const live = useRef(new Map<string, LiveProgress>());
  /** Folder each incoming transfer is being saved into, when saving to disk. */
  const folderNames = useRef(new Map<string, string>());
  /** Files received so far per incoming transfer (in memory only). */
  const receivedFiles = useRef(new Map<string, File[]>());
  const fileInput = useRef<HTMLInputElement>(null);
  const targetPeer = useRef<Peer | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const name = (deviceName ??= randomDeviceName());
    setSelfName(name);

    joinShareSession(name, {
      onPeersChange: setPeers,
      onOffer: offer => new Promise<SinkFactory | null>(resolve => {
        const total = offer.files.reduce((a, f) => a + f.size, 0);
        const plan = planReceive(total, { mobile: isMobileDevice(), canSaveToDisk: canSaveToDisk() });
        answers.current.set(offer.transferId, sinks => {
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
        updatePrompts(d => { d.push({ offer, plan }); });
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
        setConnection({ status: 'ready' });
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

  const prompt = prompts[0] ?? null;

  const answer = (sinks: SinkFactory | null) => {
    if (prompt) answers.current.get(prompt.offer.transferId)?.(sinks);
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
          {selfName && (
            <p className="text-sm text-muted-foreground">
              You appear as <span className="font-semibold text-foreground">{selfName}</span>.
              Open this page on another device on the same network, then tap it below to send files.
            </p>
          )}

          {connection.status === 'connecting' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="size-4 animate-spin" /> Connecting…
            </p>
          )}

          {connection.status === 'error' && (
            <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              <WarningCircleIcon className="size-4 shrink-0 mt-0.5" /> {connection.message}
            </p>
          )}

          {connection.status === 'ready' && peers.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <SpinnerIcon className="size-4 animate-spin" /> Looking for nearby devices…
            </p>
          )}

          {peers.length > 0 && (
            <ul aria-label="Nearby devices" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {peers.map(peer => (
                <li key={peer.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pickFilesFor(peer)}
                    className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-secondary hover:ring-1 hover:ring-brand-500/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <DevicesIcon className="size-8 text-brand-500" />
                    <span className="text-sm font-medium text-foreground text-center">{peer.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {transfers.map(t => <TransferCard key={t.id} transfer={t} onCancel={() => cancel(t)} />)}

      {received.length > 0 && <OutputFiles files={received} />}

      <AlertDialog open={prompt !== null} onOpenChange={open => { if (!open) answer(null); }}>
        <AlertDialogContent>
          {prompt && <OfferPrompt prompt={prompt} onAccept={() => answer(memorySinks)} onSaveToFolder={saveToFolder} />}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OfferPrompt({ prompt: { offer, plan }, onAccept, onSaveToFolder }: {
  prompt: Prompt;
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
