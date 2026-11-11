import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useClipboard, useInterval } from '@mantine/hooks';
import { CheckIcon, CopyIcon, ShieldCheckIcon, SpinnerIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { normalizeCode } from '@/lib/share/pairing';
import type { PairingEnd, PairingInvite, Peer } from '@/lib/share/session';

export type PairingState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'showing'; invite: PairingInvite }
  | { step: 'joining' }
  | { step: 'ended'; reason: PairingEnd }
  | { step: 'paired'; peer: Peer; emojis: string[] }
  | { step: 'mismatch'; peerName: string };

export type PairTab = 'show' | 'enter';

const END_MESSAGES: Record<PairingEnd, string> = {
  expired: 'That code expired before another device used it. Make a new one to try again.',
  'not-found': 'No device is showing that code right now. Check it and try again — codes stop working after 10 minutes.',
  failed: "Couldn't connect to that device. It may already be paired with another one, or one of the networks blocks direct connections.",
};

export default function PairDialog({ open, tab, state, onTabChange, onClose, onShowCode, onEnterCode, onConfirm, onReject }: {
  open: boolean;
  tab: PairTab;
  state: PairingState;
  onTabChange: (tab: PairTab) => void;
  onClose: () => void;
  onShowCode: () => void;
  onEnterCode: (code: string) => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {state.step === 'paired' ? (
          <SafetyCheck peer={state.peer} emojis={state.emojis} onConfirm={onConfirm} onReject={onReject} />
        ) : state.step === 'mismatch' ? (
          <>
            <DialogHeader>
              <DialogTitle>Disconnected from {state.peerName}</DialogTitle>
              <DialogDescription>
                The pairing was cancelled. If the emojis didn't match, something may have been sitting between your
                two devices — nothing was sent. Try pairing again, ideally on a different network.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pair a device</DialogTitle>
              <DialogDescription>
                For a device on a different network, like a phone on mobile data. Pairing still works when this one is
                hidden.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={tab} onValueChange={v => onTabChange(v as PairTab)} className="min-w-0">
              <TabsList className="w-full">
                <TabsTrigger value="show" className="flex-1">Show a code</TabsTrigger>
                <TabsTrigger value="enter" className="flex-1">Enter a code</TabsTrigger>
              </TabsList>
              <TabsContent value="show" className="pt-4">
                <ShowCode state={state} onShowCode={onShowCode} />
              </TabsContent>
              <TabsContent value="enter" className="pt-4">
                <EnterCode state={state} onEnterCode={onEnterCode} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Ended({ reason }: { reason: PairingEnd }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 rounded-xl">
      <WarningCircleIcon className="size-4 shrink-0 mt-0.5" /> {END_MESSAGES[reason]}
    </p>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <SpinnerIcon className="size-4 animate-spin" /> {children}
    </p>
  );
}

function ShowCode({ state, onShowCode }: { state: PairingState; onShowCode: () => void }) {
  if (state.step === 'showing') return <Invite invite={state.invite} />;
  if (state.step === 'ended' && state.reason === 'expired') {
    return (
      <div className="space-y-4">
        <Ended reason="expired" />
        <Button onClick={onShowCode}>Make a new code</Button>
      </div>
    );
  }
  return <Waiting>Making a code…</Waiting>;
}

function Invite({ invite }: { invite: PairingInvite }) {
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const clipboard = useClipboard({ timeout: 2000 });
  useInterval(() => setNow(Date.now()), 1000, { autoInvoke: true });

  useEffect(() => {
    let current = true;
    // Dark on white whatever the theme: phone cameras read that most reliably
    void QRCode.toDataURL(invite.link, { margin: 2, width: 440, errorCorrectionLevel: 'M' }).then(url => { if (current) setQr(url); });
    return () => { current = false; };
  }, [invite.link]);

  const left = Math.max(0, invite.expiresAt - now);
  const mins = Math.floor(left / 60_000);
  const secs = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        {qr
          ? <img src={qr} alt="QR code for the pairing link" className="size-52 rounded-lg bg-white" />
          : <div className="size-52 rounded-lg bg-secondary" />}
      </div>
      <p className="text-sm text-muted-foreground text-center">Scan with the other device's camera, or open the link on it.</p>

      <div className="flex items-center gap-2">
        <Input readOnly aria-label="Pairing link" value={invite.link} className="flex-1 min-w-0 font-mono text-xs" onFocus={e => e.currentTarget.select()} />
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => clipboard.copy(invite.link)}>
          {clipboard.copied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
          {clipboard.copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Or type this code on the other device</p>
        <p aria-label="Pairing code" className="font-mono text-2xl font-semibold tracking-wide text-foreground break-all">{invite.code}</p>
        <p className="text-xs text-muted-foreground tabular-nums">Expires in {mins}:{secs}</p>
      </div>

      <Waiting>Waiting for the other device…</Waiting>
    </div>
  );
}

function EnterCode({ state, onEnterCode }: { state: PairingState; onEnterCode: (code: string) => void }) {
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const joining = state.step === 'joining';

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        const code = normalizeCode(draft);
        setInvalid(!code);
        if (code) onEnterCode(code);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="pairing-code">Code from the other device</Label>
        <div className="flex items-center gap-2">
          <Input
            id="pairing-code"
            value={draft}
            onChange={e => { setDraft(e.target.value); setInvalid(false); }}
            placeholder="tiger-maple-42"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={joining}
            aria-invalid={invalid || undefined}
            className="flex-1 min-w-0 font-mono"
          />
          <Button type="submit" className="shrink-0" disabled={joining || !draft.trim()}>Pair</Button>
        </div>
        {invalid && (
          <p className="text-sm text-red-600 dark:text-red-400">
            That doesn't look like a pairing code — it's two words and a number, like tiger-maple-42.
          </p>
        )}
      </div>
      {joining && <Waiting>Looking for the device showing that code…</Waiting>}
      {state.step === 'ended' && state.reason !== 'expired' && <Ended reason={state.reason} />}
    </form>
  );
}

function SafetyCheck({ peer, emojis, onConfirm, onReject }: {
  peer: Peer;
  emojis: string[];
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-brand-500" /> Paired with {peer.name}
        </DialogTitle>
        <DialogDescription>
          Check that {peer.name} shows the same four emojis. If they're different, someone may be in the middle — choose
          “They don't match”.
        </DialogDescription>
      </DialogHeader>
      <p aria-label="Safety emojis" className="text-center text-5xl tracking-widest py-2">{emojis.join(' ')}</p>
      <DialogFooter>
        <Button variant="secondary" onClick={onReject}>They don't match</Button>
        <Button onClick={onConfirm}>They match</Button>
      </DialogFooter>
    </>
  );
}
