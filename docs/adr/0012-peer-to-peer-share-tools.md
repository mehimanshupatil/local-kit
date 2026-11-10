# Allow third-party connection setup for peer-to-peer Share tools

Amends [ADR-0000](0000-local-only-constraint.md).

The Share category (Send files and text, Call) moves data between two of the user's own devices. A browser can't open a direct connection to another browser on its own: each side needs public STUN to learn its public address, and a signalling channel to exchange connection-setup messages (WebRTC offers, answers and ICE candidates). LocalKit has no server, so signalling runs through Trystero over public Nostr relays.

ADR-0000's hard constraint is narrowed from "no server or external API, ever" to **user data never reaches a server**:

- File contents, text and call audio/video travel only over the direct WebRTC connection between the two devices, end-to-end encrypted (DTLS/SRTP). They are never sent to a relay, a STUN server, or any server of ours.
- Peer-to-peer tools may use third-party connection setup — public STUN servers and public Nostr relays — that never carries user data. These services see the device's IP address and encrypted setup messages, nothing else.
- The relays and STUN servers used are a fixed, named list in `src/lib/share/servers.ts`, disclosed on the privacy page. Changing that list means updating the privacy page in the same change.
- No TURN relay is used. TURN forwards the media itself, so a connection that can't be made directly fails with a clear message instead of falling back to a relay.
- Peer-to-peer tools need a network connection to pair. Every other tool keeps working offline after first use.

Everything else in ADR-0000 still holds: processing stays in the browser, and features that need a server or external API to handle user data remain permanently out of scope.
