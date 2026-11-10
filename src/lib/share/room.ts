const ROOM_NAMESPACE = 'localkit-share';

/**
 * Discovery room for every device behind the same public IPv4 address.
 * Hashed so the relay sees an opaque room name rather than the address itself.
 */
export async function roomIdForIp(ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ROOM_NAMESPACE}:${ip.trim()}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * Public IPv4 from a server-reflexive ICE candidate line, or null for any other
 * candidate (host, relay, IPv6, mDNS).
 * Format: `candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> ...`
 */
export function publicIpFromCandidate(candidate: string): string | null {
  const parts = candidate.replace(/^a=/, '').trim().split(/\s+/);
  const typIndex = parts.indexOf('typ');
  if (typIndex === -1 || parts[typIndex + 1] !== 'srflx') return null;
  const address = parts[4];
  return address && IPV4.test(address) ? address : null;
}

/**
 * Learn this device's public IPv4 by gathering ICE candidates against STUN.
 * Resolves null if no server-reflexive IPv4 candidate arrives before the timeout
 * (offline, STUN blocked, or IPv6-only network).
 */
export function discoverPublicIp(iceServers: RTCIceServer[], timeoutMs = 5000): Promise<string | null> {
  return new Promise(resolve => {
    const pc = new RTCPeerConnection({ iceServers });
    let settled = false;
    const finish = (ip: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pc.close();
      resolve(ip);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    pc.onicecandidate = e => {
      if (!e.candidate) return finish(null);
      const ip = publicIpFromCandidate(e.candidate.candidate);
      if (ip) finish(ip);
    };
    pc.createDataChannel('probe');
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => finish(null));
  });
}
