// Third-party services the Share tools use for connection setup only (ADR-0012).
// They never carry file data. This list is disclosed on the privacy page — keep
// the two in sync.

export interface ConnectionService {
  url: string;
  operator: string;
}

/** Public Nostr relays used to exchange encrypted WebRTC setup messages. */
export const NOSTR_RELAYS: ConnectionService[] = [
  { url: 'wss://relay.damus.io', operator: 'Damus' },
  { url: 'wss://nos.lol', operator: 'nos.lol' },
  { url: 'wss://relay.primal.net', operator: 'Primal' },
  { url: 'wss://relay.nostr.band', operator: 'nostr.band' },
  { url: 'wss://relay.snort.social', operator: 'Snort' },
];

/** Public STUN servers used to learn this device's public address. */
export const STUN_SERVERS: ConnectionService[] = [
  { url: 'stun:stun.l.google.com:19302', operator: 'Google' },
  { url: 'stun:stun1.l.google.com:19302', operator: 'Google' },
  { url: 'stun:stun.cloudflare.com:3478', operator: 'Cloudflare' },
];

export interface ShareConfig {
  relayUrls: string[];
  iceServers: RTCIceServer[];
  /** Skip STUN discovery and use this address for the discovery room. */
  publicIp?: string;
  /** Let peers on one machine connect when mDNS host candidates can't resolve (headless test browsers). */
  loopbackFallback?: boolean;
}

declare global {
  interface Window {
    /** Test-only override, injected by Playwright before the page loads. */
    __LOCALKIT_SHARE__?: Partial<ShareConfig>;
  }
}

export function getShareConfig(): ShareConfig {
  const override = typeof window === 'undefined' ? undefined : window.__LOCALKIT_SHARE__;
  return {
    relayUrls: NOSTR_RELAYS.map(r => r.url),
    iceServers: STUN_SERVERS.map(s => ({ urls: s.url })),
    ...override,
  };
}
