import { useEffect, useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import { useToolVisit } from '@/stores/toolVisit';
import { DevicesIcon, PaperPlaneTiltIcon, SpinnerIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { randomDeviceName } from '@/lib/share/names';
import { joinShareSession, type IncomingOffer, type Peer, type ShareSession } from '@/lib/share/session';

type Connection = { status: 'connecting' } | { status: 'ready' } | { status: 'error'; message: string };

interface Outgoing {
  peerName: string;
  fileName: string;
  status: 'waiting' | 'sending' | 'sent' | 'declined' | 'error';
  progress: number;
  error?: string;
}

interface Incoming {
  transferId: string;
  peerName: string;
  fileName: string;
  progress: number;
  error?: string;
}

// One name per page load, so a remount doesn't make this device show up under a new name
let deviceName: string | null = null;

const percent = (done: number, total: number) => (total === 0 ? 100 : Math.round((done / total) * 100));

export default function SendTool() {
  useToolVisit('share', '/share/send');
  // Picked on the client: a server-rendered random name would never match hydration
  const [selfName, setSelfName] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: 'connecting' });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [prompt, setPrompt] = useState<IncomingOffer | null>(null);
  const [outgoing, updateOutgoing] = useImmer<Outgoing | null>(null);
  const [incoming, updateIncoming] = useImmer<Incoming | null>(null);
  const [received, updateReceived] = useImmer<OutputFile[]>([]);

  const session = useRef<ShareSession | null>(null);
  const answerPrompt = useRef<((accept: boolean) => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const targetPeer = useRef<Peer | null>(null);

  useEffect(() => {
    let cancelled = false;
    const name = (deviceName ??= randomDeviceName());
    setSelfName(name);
    joinShareSession(name, {
      onPeersChange: setPeers,
      onOffer: offer => new Promise<boolean>(resolve => {
        answerPrompt.current = accept => {
          answerPrompt.current = null;
          setPrompt(null);
          if (accept) {
            updateIncoming(() => ({ transferId: offer.transferId, peerName: offer.peerName, fileName: offer.name, progress: 0 }));
          }
          resolve(accept);
        };
        setPrompt(offer);
      }),
      onReceiveProgress: (transferId, done, total) => updateIncoming(d => {
        if (d?.transferId === transferId) d.progress = percent(done, total);
      }),
      onReceived: (transferId, file) => {
        updateIncoming(d => (d?.transferId === transferId ? null : d));
        updateReceived(d => { d.unshift({ name: file.name, blob: file, size: file.size }); });
        downloadBlob(file, file.name);
      },
      onReceiveError: (transferId, message) => updateIncoming(d => {
        if (d?.transferId === transferId) d.error = message;
      }),
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
      answerPrompt.current?.(false);
      void session.current?.leave();
      session.current = null;
    };
  }, []);

  const pickFileFor = (peer: Peer) => {
    targetPeer.current = peer;
    fileInput.current?.click();
  };

  const send = async (file: File) => {
    const peer = targetPeer.current;
    if (!peer || !session.current) return;
    updateOutgoing(() => ({ peerName: peer.name, fileName: file.name, status: 'waiting', progress: 0 }));
    try {
      const result = await session.current.sendFile(peer.id, file, (done, total) => updateOutgoing(d => {
        if (!d) return;
        d.status = 'sending';
        d.progress = percent(done, total);
      }));
      updateOutgoing(d => { if (d) d.status = result; });
    } catch (e) {
      updateOutgoing(d => {
        if (!d) return;
        d.status = 'error';
        d.error = e instanceof Error ? e.message : 'The transfer failed.';
      });
    }
  };

  const busy = outgoing?.status === 'waiting' || outgoing?.status === 'sending';

  return (
    <div className="space-y-5">
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void send(file);
        }}
      />

      <Card>
        <CardContent className="pt-5 space-y-4">
          {selfName && (
            <p className="text-sm text-muted-foreground">
              You appear as <span className="font-semibold text-foreground">{selfName}</span>.
              Open this page on another device on the same network, then tap it below to send a file.
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
                    onClick={() => pickFileFor(peer)}
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

      {outgoing && (
        <Card>
          <CardContent className="pt-5 space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <PaperPlaneTiltIcon className="size-4 text-brand-500" />
              <span className="truncate">{outgoing.fileName} → {outgoing.peerName}</span>
            </p>
            {outgoing.status === 'waiting' && (
              <p className="text-sm text-muted-foreground">Waiting for {outgoing.peerName} to accept…</p>
            )}
            {outgoing.status === 'sending' && <ProgressBar progress={outgoing.progress} label="Sending…" />}
            {outgoing.status === 'sent' && <p className="text-sm text-brand-500">Sent to {outgoing.peerName}.</p>}
            {outgoing.status === 'declined' && (
              <p className="text-sm text-muted-foreground">{outgoing.peerName} declined the file.</p>
            )}
            {outgoing.status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400">{outgoing.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {incoming && (
        <Card>
          <CardContent className="pt-5 space-y-3" aria-live="polite">
            <p className="text-sm font-medium text-foreground truncate">
              {incoming.fileName} from {incoming.peerName}
            </p>
            {incoming.error
              ? <p className="text-sm text-red-600 dark:text-red-400">{incoming.error}</p>
              : <ProgressBar progress={incoming.progress} label="Receiving…" />}
          </CardContent>
        </Card>
      )}

      {received.length > 0 && <OutputFiles files={received} />}

      <AlertDialog open={prompt !== null} onOpenChange={open => { if (!open) answerPrompt.current?.(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{prompt?.peerName} wants to send you a file</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {prompt?.name} · {formatFileSize(prompt?.size ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answerPrompt.current?.(false)}>Decline</AlertDialogCancel>
            <AlertDialogAction onClick={() => answerPrompt.current?.(true)}>Accept</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
