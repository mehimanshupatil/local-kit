import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '@mantine/hooks';
import { usePrefsStore, useToolPrefs } from '@/stores/prefsStore';
import { randomDeviceName } from '@/lib/share/names';
import { cleanName, thisDevice, type Profile } from '@/lib/share/device';
import { secretFromHash } from '@/lib/share/pairing';
import {
  createShareSession, type Peer, type ShareApp, type ShareSession, type ShareToolHandlers,
} from '@/lib/share/session';
import type { PairTab, PairingState } from './PairDialog';

/** The nearby room's state. */
export type Connection =
  | { status: 'connecting' }
  | { status: 'ready' }
  /** "Visible to others" is off. */
  | { status: 'hidden' }
  /** No network when the page tried to connect. */
  | { status: 'offline' }
  | { status: 'error'; message: string };

// One name per page load even if localStorage is unavailable, so a remount doesn't rename this device
let fallbackName: string | null = null;

// Shared by every Share tool, so a device has the same name and visibility on each
const SHARE_PREFS = { deviceName: '', visible: true };

/**
 * Saved prefs as they are right now. During hydration React renders with the
 * store's server snapshot (the defaults), so effects that run on mount must not
 * trust `prefs` from render — a hidden device would briefly join, and a renamed
 * one would get a new random name.
 */
const storedSharePrefs = () => ({ ...SHARE_PREFS, ...usePrefsStore.getState().toolPrefs.share } as typeof SHARE_PREFS);

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Everything a Share tool needs around its own feature: this device's profile,
 * the session and its nearby room, visibility, the network, and pairing.
 * `handlers` are the tool's own events (file offers, calls…); the latest ones are always used.
 */
export function useShareSession(app: ShareApp, handlers: ShareToolHandlers) {
  const [prefs, setPrefs] = useToolPrefs('share', SHARE_PREFS);
  const { online } = useNetwork();
  // Set on the client only: a stored or random name rendered on the server would never match hydration
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<Connection>({ status: 'connecting' });
  /** Bumped to rejoin, e.g. when the network comes back. */
  const [attempt, setAttempt] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairTab, setPairTab] = useState<PairTab>('show');
  const [pairing, setPairing] = useState<PairingState>({ step: 'idle' });

  const session = useRef<ShareSession | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Before the session effect below, which reads profileRef
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
      ...forwardToLatest(handlersRef),
    }, { app })
      .then(s => {
        if (cancelled) return void s.leave();
        session.current = s;
        setSessionReady(true);
      })
      .catch(e => {
        if (!cancelled) setConnection({ status: 'error', message: errorMessage(e, 'Could not start sharing.') });
      });

    return () => {
      cancelled = true;
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
      .catch(e => { if (!stale) setConnection({ status: 'error', message: errorMessage(e, 'Could not start sharing.') }); });
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

  return {
    session,
    sessionReady,
    profile,
    rename,
    visible: prefs.visible,
    setVisible: (visible: boolean) => setPrefs({ visible }),
    online,
    connection,
    connectionFailed,
    dismissConnectionFailed: () => setConnectionFailed(false),
    peers,
    pairing: {
      open: pairOpen,
      tab: pairTab,
      state: pairing,
      start: () => {
        setPairTab('show');
        setPairOpen(true);
        showCode();
      },
      changeTab: (tab: PairTab) => {
        setPairTab(tab);
        session.current?.cancelPairing();
        if (tab === 'show') showCode();
        else setPairing({ step: 'idle' });
      },
      showCode,
      enterCode,
      close: closePairing,
      reject: () => {
        if (pairing.step !== 'paired') return;
        session.current?.unpair(pairing.peer.id);
        setPairing({ step: 'mismatch', peerName: pairing.peer.name });
      },
    },
  };
}

export type ShareSessionState = ReturnType<typeof useShareSession>;

const TOOL_HANDLERS: (keyof ShareToolHandlers)[] = [
  'onOffer', 'onTextOffer', 'onText', 'onCall', 'onRemoteStream', 'onCallState', 'onCallEnded', 'onOfferWithdrawn',
  'onReceiveProgress', 'onFileReceived', 'onReceiveComplete', 'onReceiveEnded',
];

/**
 * Handlers that call whatever the tool rendered most recently. Only those the
 * tool provides when the session starts are wired, so a missing one means "decline".
 */
function forwardToLatest(ref: { current: ShareToolHandlers }): ShareToolHandlers {
  const out: Record<string, (...args: never[]) => unknown> = {};
  for (const name of TOOL_HANDLERS) {
    if (!ref.current[name]) continue;
    out[name] = (...args) => (ref.current[name] as (...a: typeof args) => unknown)(...args);
  }
  return out as ShareToolHandlers;
}
