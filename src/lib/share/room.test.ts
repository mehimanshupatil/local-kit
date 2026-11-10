import { describe, expect, it } from 'vitest';
import { publicIpFromCandidate, roomIdForIp } from './room';

describe('roomIdForIp', () => {
  it('gives devices on the same IP the same room', async () => {
    expect(await roomIdForIp('203.0.113.7')).toBe(await roomIdForIp('203.0.113.7'));
  });

  it('gives different IPs different rooms', async () => {
    expect(await roomIdForIp('203.0.113.7')).not.toBe(await roomIdForIp('203.0.113.8'));
  });

  it('ignores surrounding whitespace', async () => {
    expect(await roomIdForIp(' 203.0.113.7\n')).toBe(await roomIdForIp('203.0.113.7'));
  });

  it('is 32 hex characters and does not contain the IP', async () => {
    const id = await roomIdForIp('203.0.113.7');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain('203');
  });
});

describe('publicIpFromCandidate', () => {
  it('reads the address from a server-reflexive IPv4 candidate', () => {
    const line = 'candidate:842163049 1 udp 1677729535 203.0.113.7 54321 typ srflx raddr 0.0.0.0 rport 0 generation 0';
    expect(publicIpFromCandidate(line)).toBe('203.0.113.7');
  });

  it('accepts an a= SDP prefix', () => {
    expect(publicIpFromCandidate('a=candidate:1 1 udp 1 198.51.100.4 3478 typ srflx raddr 10.0.0.2 rport 1')).toBe('198.51.100.4');
  });

  it('ignores host, relay and mDNS candidates', () => {
    expect(publicIpFromCandidate('candidate:1 1 udp 2122260223 192.168.1.20 50000 typ host')).toBeNull();
    expect(publicIpFromCandidate('candidate:1 1 udp 2122260223 4a1c-uuid.local 50000 typ host')).toBeNull();
    expect(publicIpFromCandidate('candidate:1 1 udp 1 203.0.113.9 3478 typ relay raddr 1.2.3.4 rport 1')).toBeNull();
  });

  it('ignores IPv6 server-reflexive candidates', () => {
    expect(publicIpFromCandidate('candidate:1 1 udp 1 2001:db8::1 3478 typ srflx raddr :: rport 0')).toBeNull();
  });

  it('ignores malformed lines', () => {
    expect(publicIpFromCandidate('')).toBeNull();
    expect(publicIpFromCandidate('candidate:1 1 udp 1 999.1.1.1 3478 typ srflx')).toBeNull();
  });
});
