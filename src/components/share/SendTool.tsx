import { useEffect, useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import { useClipboard, useInterval, useLongPress } from '@mantine/hooks';
import { useToolVisit } from '@/stores/toolVisit';
import {
  ChatTextIcon, CheckIcon, CopyIcon, DownloadSimpleIcon, FolderOpenIcon, PaperPlaneTiltIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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
import type { IncomingOffer, IncomingTextOffer, OutgoingTransfer, Peer, TransferEnd } from '@/lib/share/session';
import { MAX_TEXT_LENGTH, linkify } from '@/lib/share/text';
import { canSaveToDisk, isMobileDevice, memorySinks, pickFolderSinks, type SinkFactory } from '@/lib/share/sinks';
import { SpeedMeter, batchProgress, planReceive, type BatchProgress, type ReceivePlan } from '@/lib/share/transfer';
import DevicePanel, { DeviceSummary } from './DevicePanel';
import { useShareSession } from './useShareSession';

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

const PROGRESS_REFRESH_MS = 200;
const PROMPT_FILE_LIMIT = 5;

const isLive = (t: { status: TransferStatus }) => t.status === 'waiting' || t.status === 'active';
const endStatus = (end: TransferEnd): TransferStatus => (end.reason === 'error' ? 'error' : end.reason);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function SendTool() {
  useToolVisit('share', '/share/send');
  const [prompts, updatePrompts] = useImmer<Prompt[]>([]);
  const [transfers, updateTransfers] = useImmer<Transfer[]>([]);
  const [received, updateReceived] = useImmer<OutputFile[]>([]);
  const [notes, updateNotes] = useImmer<Note[]>([]);
  const [composeFor, setComposeFor] = useState<Peer | null>(null);

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

  const share = useShareSession('send', {
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
  });
  const { session } = share;

  // Leaving the page: decline anything still on screen and stop anything still sending
  useEffect(() => () => {
    for (const answer of answers.current.values()) answer(null);
    for (const t of outgoing.current.values()) t.cancel();
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

      <DevicePanel
        share={share}
        visibilityLocked={anyLive}
        hint={<>
          Open this page on another device on the same network, then tap it below to send files.
          Right-click or long-press it to send text instead.
        </>}
        renderDevice={peer => (
          <DeviceButton
            peer={peer}
            filesBusy={busy}
            onSendFiles={() => pickFilesFor(peer)}
            onSendText={() => setComposeFor(peer)}
          />
        )}
      />

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
      <DeviceSummary peer={peer} />
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
