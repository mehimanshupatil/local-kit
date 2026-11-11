import { useEffect, useRef, useState } from 'react';
import { useToolVisit } from '@/stores/toolVisit';
import {
  MicrophoneIcon, MicrophoneSlashIcon, PhoneDisconnectIcon, PhoneIcon, SpinnerIcon, VideoCameraIcon,
  VideoCameraSlashIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils/cn';
import { mediaErrorMessage, openCamera, stopStream } from '@/lib/share/media';
import type { CallState, IncomingCall, OutgoingCall, Peer } from '@/lib/share/session';
import DevicePanel, { DeviceSummary, Notice } from './DevicePanel';
import { useShareSession } from './useShareSession';

type Phase =
  | { phase: 'idle' }
  | { phase: 'calling'; peer: Peer; outgoing: OutgoingCall }
  | { phase: 'in-call'; callId: string; peerName: string }
  /** A call just ended or never started; says why. */
  | { phase: 'ended'; message: string };

const NOBODY: Omit<CallState, 'callId'> = { muted: false, cameraOff: false };

export default function CallTool() {
  useToolVisit('share', '/share/call');
  const [phase, setPhase] = useState<Phase>({ phase: 'idle' });
  const [ringing, setRinging] = useState<IncomingCall | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [mine, setMine] = useState(NOBODY);
  const [theirs, setTheirs] = useState(NOBODY);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const answerRef = useRef<((stream: MediaStream | null) => void) | null>(null);

  const setLocalStream = (stream: MediaStream | null) => {
    if (localRef.current && localRef.current !== stream) stopStream(localRef.current);
    localRef.current = stream;
    setLocal(stream);
  };

  /** Back to the device list, camera off. */
  const reset = (message: string | null) => {
    setLocalStream(null);
    setRemote(null);
    setMine(NOBODY);
    setTheirs(NOBODY);
    setPhase(message ? { phase: 'ended', message } : { phase: 'idle' });
  };

  const share = useShareSession('call', {
    onCall: call => new Promise<MediaStream | null>(resolve => {
      // One call at a time
      if (phaseRef.current.phase === 'calling' || phaseRef.current.phase === 'in-call' || answerRef.current) {
        return resolve(null);
      }
      answerRef.current = stream => {
        answerRef.current = null;
        setRinging(null);
        if (stream) setPhase({ phase: 'in-call', callId: call.callId, peerName: call.peerName });
        resolve(stream);
      };
      setRinging(call);
    }),
    onOfferWithdrawn: () => {
      answerRef.current?.(null);
    },
    onRemoteStream: (_, stream) => setRemote(stream),
    onCallState: ({ muted, cameraOff }) => setTheirs({ muted, cameraOff }),
    onCallEnded: (callId, reason) => {
      const p = phaseRef.current;
      if (p.phase !== 'in-call' || p.callId !== callId) return;
      reset(reason === 'hung-up' ? `${p.peerName} hung up.` : `The call dropped — ${p.peerName} disconnected.`);
    },
  });
  const { session } = share;

  // Leaving the page ends the call and turns the camera off
  useEffect(() => () => {
    answerRef.current?.(null);
    const p = phaseRef.current;
    if (p.phase === 'calling') p.outgoing.cancel();
    if (p.phase === 'in-call') session.current?.hangUp(p.callId);
    stopStream(localRef.current);
  }, []);

  const startCall = async (peer: Peer) => {
    const s = session.current;
    if (!s || phase.phase === 'calling' || phase.phase === 'in-call') return;
    setMediaError(null);
    let stream: MediaStream;
    try {
      stream = await openCamera();
    } catch (e) {
      return setMediaError(mediaErrorMessage(e));
    }
    setLocalStream(stream);
    const outgoing = s.call(peer.id, stream);
    setPhase({ phase: 'calling', peer, outgoing });
    try {
      const result = await outgoing.answered;
      if (result === 'accepted') setPhase({ phase: 'in-call', callId: outgoing.callId, peerName: peer.name });
      else reset(result === 'declined' ? `${peer.name} didn't answer.` : null);
    } catch (e) {
      reset(e instanceof Error ? e.message : `Couldn't reach ${peer.name}.`);
    }
  };

  const accept = async () => {
    setMediaError(null);
    try {
      const stream = await openCamera();
      setLocalStream(stream);
      answerRef.current?.(stream);
    } catch (e) {
      setMediaError(mediaErrorMessage(e));
      answerRef.current?.(null);
    }
  };

  const hangUp = () => {
    if (phase.phase === 'calling') {
      phase.outgoing.cancel();
      return;
    }
    if (phase.phase !== 'in-call') return;
    session.current?.hangUp(phase.callId);
    reset('Call ended.');
  };

  const toggle = (what: 'muted' | 'cameraOff') => {
    const next = { ...mine, [what]: !mine[what] };
    setMine(next);
    // Disabling a track sends silence or black frames without renegotiating the connection
    for (const track of what === 'muted' ? local?.getAudioTracks() ?? [] : local?.getVideoTracks() ?? []) {
      track.enabled = !next[what];
    }
    if (phase.phase === 'in-call') session.current?.setCallState({ callId: phase.callId, ...next });
  };

  const busy = phase.phase === 'calling' || phase.phase === 'in-call';

  return (
    <div className="space-y-5">
      {!busy && (
        <DevicePanel
          share={share}
          visibilityLocked={busy}
          hint="Open this page on another device, then tap it below to start a video call."
          renderDevice={peer => (
            <button
              type="button"
              onClick={() => void startCall(peer)}
              className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-secondary hover:ring-1 hover:ring-brand-500/40 transition-colors"
            >
              <DeviceSummary peer={peer} />
            </button>
          )}
        />
      )}

      {mediaError && <Notice icon={WarningCircleIcon} tone="error" onDismiss={() => setMediaError(null)}>{mediaError}</Notice>}

      {phase.phase === 'ended' && (
        <Notice icon={PhoneDisconnectIcon} onDismiss={() => setPhase({ phase: 'idle' })}>{phase.message}</Notice>
      )}

      {busy && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              {phase.phase === 'in-call' && remote && (
                <StreamVideo stream={remote} label={`Video from ${phase.peerName}`} className={cn('size-full object-contain', theirs.cameraOff && 'invisible')} />
              )}
              {(phase.phase === 'calling' || !remote || theirs.cameraOff) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
                  {phase.phase === 'calling' ? (
                    <><SpinnerIcon className="size-6 animate-spin" /> Calling {phase.peer.name}…</>
                  ) : !remote ? (
                    <><SpinnerIcon className="size-6 animate-spin" /> Connecting…</>
                  ) : (
                    <><VideoCameraSlashIcon className="size-8" /> {phase.peerName}'s camera is off</>
                  )}
                </div>
              )}
              {phase.phase === 'in-call' && theirs.muted && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                  <MicrophoneSlashIcon className="size-3.5" /> {phase.peerName} is muted
                </span>
              )}
              {local && (
                <div className="absolute bottom-3 right-3 w-1/4 min-w-24 aspect-video overflow-hidden rounded-lg border border-white/20 bg-neutral-900">
                  {/* Muted so you never hear yourself; mirrored like a mirror */}
                  <StreamVideo stream={local} muted label="Your camera" className={cn('size-full object-cover -scale-x-100', mine.cameraOff && 'invisible')} />
                  {mine.cameraOff && (
                    <VideoCameraSlashIcon className="absolute inset-0 m-auto size-5 text-white/70" aria-hidden />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                variant={mine.muted ? 'default' : 'secondary'}
                size="icon-lg"
                aria-label={mine.muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={mine.muted}
                disabled={phase.phase !== 'in-call'}
                onClick={() => toggle('muted')}
              >
                {mine.muted ? <MicrophoneSlashIcon className="size-5" /> : <MicrophoneIcon className="size-5" />}
              </Button>
              <Button
                variant={mine.cameraOff ? 'default' : 'secondary'}
                size="icon-lg"
                aria-label={mine.cameraOff ? 'Turn camera on' : 'Turn camera off'}
                aria-pressed={mine.cameraOff}
                disabled={phase.phase !== 'in-call'}
                onClick={() => toggle('cameraOff')}
              >
                {mine.cameraOff ? <VideoCameraSlashIcon className="size-5" /> : <VideoCameraIcon className="size-5" />}
              </Button>
              <Button variant="destructive" size="lg" onClick={hangUp}>
                <PhoneDisconnectIcon className="size-5" /> {phase.phase === 'calling' ? 'Cancel' : 'Hang up'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={ringing !== null} onOpenChange={open => { if (!open) answerRef.current?.(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PhoneIcon className="size-5 text-brand-500" /> {ringing?.peerName} is calling
            </AlertDialogTitle>
            <AlertDialogDescription>Answering turns on your camera and microphone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Decline</AlertDialogCancel>
            <AlertDialogAction onClick={() => void accept()}>
              <VideoCameraIcon className="size-4" /> Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StreamVideo({ stream, muted = false, label, className }: {
  stream: MediaStream;
  muted?: boolean;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} className={className} />;
}
