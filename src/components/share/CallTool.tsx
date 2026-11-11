import { useEffect, useRef, useState } from 'react';
import { useInterval } from '@mantine/hooks';
import { useToolVisit } from '@/stores/toolVisit';
import {
  CameraRotateIcon, CellSignalFullIcon, CellSignalLowIcon, CellSignalMediumIcon, MicrophoneIcon, MicrophoneSlashIcon,
  MonitorArrowUpIcon, PhoneDisconnectIcon, PhoneIcon, PictureInPictureIcon, SpinnerIcon, VideoCameraIcon,
  VideoCameraSlashIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils/cn';
import {
  canPictureInPicture, canShareScreen, listCameras, mediaErrorMessage, nextCamera, openCamera, openCameraTrack, openScreen,
  stopStream,
} from '@/lib/share/media';
import { isMobileDevice } from '@/lib/share/sinks';
import { rateQuality, readStats, type CallQuality, type PacketCounters } from '@/lib/share/quality';
import type { CallState, IncomingCall, OutgoingCall, Peer } from '@/lib/share/session';
import DevicePanel, { DeviceSummary, Notice } from './DevicePanel';
import { useShareSession } from './useShareSession';

type Phase =
  | { phase: 'idle' }
  | { phase: 'calling'; peer: Peer; outgoing: OutgoingCall }
  | { phase: 'in-call'; callId: string; peerName: string }
  /** A call just ended or never started; says why. */
  | { phase: 'ended'; message: string };

const NOBODY: Omit<CallState, 'callId'> = { muted: false, cameraOff: false, sharing: false };
const QUALITY_REFRESH_MS = 2000;

export default function CallTool() {
  useToolVisit('share', '/share/call');
  const [phase, setPhase] = useState<Phase>({ phase: 'idle' });
  const [ringing, setRinging] = useState<IncomingCall | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [mine, setMineState] = useState(NOBODY);
  const [theirs, setTheirs] = useState(NOBODY);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  /** Front cameras are shown mirrored, like a mirror; a back camera isn't. */
  const [mirror, setMirror] = useState(true);
  const [quality, setQuality] = useState<CallQuality | null>(null);
  // Decided after mount: these depend on the browser, so the server can't render them
  const [support, setSupport] = useState({ screen: false, pip: false });

  const localRef = useRef<MediaStream | null>(null);
  const setMine = (next: typeof NOBODY) => {
    mineRef.current = next;
    setMineState(next);
  };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mineRef = useRef(NOBODY);
  const answerRef = useRef<((stream: MediaStream | null) => void) | null>(null);
  /** The camera, kept running while the screen is shared in its place. */
  const cameraWhileSharing = useRef<MediaStreamTrack | null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const packetCounters = useRef<PacketCounters | null>(null);

  useEffect(() => {
    setSupport({ screen: canShareScreen(isMobileDevice()), pip: canPictureInPicture() });
  }, []);

  const setLocalStream = (stream: MediaStream | null) => {
    if (localRef.current && localRef.current !== stream) stopStream(localRef.current);
    localRef.current = stream;
    setLocal(stream);
  };

  /** Back to the device list, camera off. */
  const reset = (message: string | null) => {
    cameraWhileSharing.current?.stop();
    cameraWhileSharing.current = null;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    packetCounters.current = null;
    setQuality(null);
    setMirror(true);
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
    onCallState: ({ muted, cameraOff, sharing }) => setTheirs({ muted, cameraOff, sharing: Boolean(sharing) }),
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
    cameraWhileSharing.current?.stop();
  }, []);

  const inCallId = phase.phase === 'in-call' ? phase.callId : null;

  // Which cameras there are; their IDs only become meaningful once camera permission is given
  useEffect(() => {
    if (!inCallId) return;
    const refresh = () => void listCameras().then(setCameras);
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [inCallId]);

  const quality$ = useInterval(() => {
    const callId = phaseRef.current.phase === 'in-call' ? phaseRef.current.callId : null;
    if (!callId) return;
    void session.current?.getCallStats(callId).then(report => {
      if (!report || phaseRef.current.phase !== 'in-call') return;
      const { rttMs, lossPct, counters } = readStats(report.values(), packetCounters.current);
      packetCounters.current = counters;
      setQuality({ level: rateQuality(rttMs, lossPct), rttMs, lossPct });
    });
  }, QUALITY_REFRESH_MS);

  useEffect(() => {
    if (!inCallId) return;
    quality$.start();
    return quality$.stop;
  }, [inCallId]);

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

  const announce = (next: typeof mine) => {
    setMine(next);
    if (phase.phase === 'in-call') session.current?.setCallState({ callId: phase.callId, ...next });
  };

  const toggle = (what: 'muted' | 'cameraOff') => {
    const next = { ...mine, [what]: !mine[what] };
    // Disabling a track sends silence or black frames without renegotiating the connection
    for (const track of what === 'muted' ? local?.getAudioTracks() ?? [] : local?.getVideoTracks() ?? []) {
      track.enabled = !next[what];
    }
    announce(next);
  };

  /** Send the camera again in place of the screen. */
  const stopSharing = async (screen: MediaStreamTrack) => {
    const camera = cameraWhileSharing.current;
    const p = phaseRef.current;
    cameraWhileSharing.current = null;
    screen.stop();
    if (!camera || p.phase !== 'in-call') return;
    await session.current?.replaceVideoTrack(p.callId, screen, camera);
    announce({ ...mineRef.current, sharing: false });
  };

  const toggleSharing = async () => {
    if (phase.phase !== 'in-call' || !local) return;
    const current = local.getVideoTracks()[0];
    if (mine.sharing) return void stopSharing(current);
    let screen: MediaStreamTrack;
    try {
      screen = await openScreen();
    } catch (e) {
      // Closing the picker isn't an error worth reporting
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      return setMediaError(mediaErrorMessage(e));
    }
    cameraWhileSharing.current = current;
    // The browser's own "Stop sharing" button ends the track
    screen.addEventListener('ended', () => void stopSharing(screen));
    await session.current?.replaceVideoTrack(phase.callId, current, screen);
    announce({ ...mine, sharing: true });
  };

  const switchCamera = async () => {
    if (phase.phase !== 'in-call' || !local || mine.sharing) return;
    const current = local.getVideoTracks()[0];
    const next = nextCamera(cameras, current?.getSettings().deviceId);
    if (!next || !current) return;
    try {
      const track = await openCameraTrack(next);
      track.enabled = !mine.cameraOff;
      await session.current?.replaceVideoTrack(phase.callId, current, track);
      current.stop();
      setMirror(track.getSettings().facingMode !== 'environment');
    } catch (e) {
      setMediaError(mediaErrorMessage(e));
    }
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await remoteVideo.current?.requestPictureInPicture();
    } catch {
      // Not allowed right now (e.g. no video yet); the button simply does nothing
    }
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
                <StreamVideo
                  ref={remoteVideo}
                  stream={remote}
                  label={`Video from ${phase.peerName}`}
                  className={cn('size-full object-contain', theirs.cameraOff && !theirs.sharing && 'invisible')}
                />
              )}
              {(phase.phase === 'calling' || !remote || (theirs.cameraOff && !theirs.sharing)) && (
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
              {phase.phase === 'in-call' && (theirs.muted || theirs.sharing) && (
                <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                  {theirs.sharing && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                      <MonitorArrowUpIcon className="size-3.5" /> {phase.peerName} is sharing their screen
                    </span>
                  )}
                  {theirs.muted && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                      <MicrophoneSlashIcon className="size-3.5" /> {phase.peerName} is muted
                    </span>
                  )}
                </div>
              )}
              {phase.phase === 'in-call' && quality && <QualityBadge quality={quality} />}
              {local && (
                <div className="absolute bottom-3 right-3 w-1/4 min-w-24 aspect-video overflow-hidden rounded-lg border border-white/20 bg-neutral-900">
                  {/* Muted so you never hear yourself */}
                  <StreamVideo
                    stream={local}
                    muted
                    label={mine.sharing ? 'Your screen' : 'Your camera'}
                    className={cn(
                      'size-full',
                      mine.sharing ? 'object-contain' : 'object-cover',
                      mirror && !mine.sharing && '-scale-x-100',
                      mine.cameraOff && !mine.sharing && 'invisible',
                    )}
                  />
                  {mine.cameraOff && !mine.sharing && (
                    <VideoCameraSlashIcon className="absolute inset-0 m-auto size-5 text-white/70" aria-hidden />
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
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
                disabled={phase.phase !== 'in-call' || mine.sharing}
                onClick={() => toggle('cameraOff')}
              >
                {mine.cameraOff ? <VideoCameraSlashIcon className="size-5" /> : <VideoCameraIcon className="size-5" />}
              </Button>
              {cameras.length > 1 && (
                <Button
                  variant="secondary"
                  size="icon-lg"
                  aria-label="Switch camera"
                  disabled={phase.phase !== 'in-call' || mine.sharing}
                  onClick={() => void switchCamera()}
                >
                  <CameraRotateIcon className="size-5" />
                </Button>
              )}
              {support.screen && (
                <Button
                  variant={mine.sharing ? 'default' : 'secondary'}
                  size="icon-lg"
                  aria-label={mine.sharing ? 'Stop sharing your screen' : 'Share your screen'}
                  aria-pressed={mine.sharing}
                  disabled={phase.phase !== 'in-call'}
                  onClick={() => void toggleSharing()}
                >
                  <MonitorArrowUpIcon className="size-5" />
                </Button>
              )}
              {support.pip && (
                <Button
                  variant="secondary"
                  size="icon-lg"
                  aria-label="Picture in picture"
                  disabled={phase.phase !== 'in-call' || !remote}
                  onClick={() => void togglePictureInPicture()}
                >
                  <PictureInPictureIcon className="size-5" />
                </Button>
              )}
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

function StreamVideo({ ref, stream, muted = false, label, className }: {
  ref?: React.Ref<HTMLVideoElement>;
  stream: MediaStream;
  muted?: boolean;
  label: string;
  className?: string;
}) {
  const own = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (own.current) own.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={el => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      className={className}
    />
  );
}

const QUALITY = {
  good: { Icon: CellSignalFullIcon, label: 'Good', className: 'text-green-400' },
  fair: { Icon: CellSignalMediumIcon, label: 'Fair', className: 'text-amber-400' },
  poor: { Icon: CellSignalLowIcon, label: 'Poor', className: 'text-red-400' },
} as const;

function QualityBadge({ quality }: { quality: CallQuality }) {
  const { Icon, label, className } = QUALITY[quality.level];
  const rtt = quality.rttMs === null ? null : `${quality.rttMs} ms`;
  const description = `Connection quality: ${label.toLowerCase()}${rtt ? `, ${rtt} round trip` : ''}, ${quality.lossPct.toFixed(1)}% packets lost`;
  return (
    <span
      role="status"
      aria-label={description}
      title={description}
      className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white"
    >
      <Icon className={cn('size-3.5', className)} weight="bold" />
      {label}
      {rtt && <span className="text-white/60 tabular-nums">· {rtt}</span>}
    </span>
  );
}
