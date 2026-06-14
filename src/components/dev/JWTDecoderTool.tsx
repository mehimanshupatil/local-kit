import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import { CopyIcon, CheckIcon, WarningCircleIcon, CheckCircleIcon } from '@phosphor-icons/react';

interface JWTData {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

function base64UrlDecode(str: string): string {
  // Pad to a multiple of 4
  const padded = str + '==='.slice((str.length + 3) % 4);
  // Replace URL-safe chars
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

function decodeJWT(token: string): JWTData {
  const parts = token.trim().split('.');
  if (parts.length !== 3) throw new Error('JWT must have exactly 3 parts separated by dots');
  const [headerB64, payloadB64, sig] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64));
  const payload = JSON.parse(base64UrlDecode(payloadB64));
  return { header, payload, signature: sig };
}

function expiryStatus(payload: Record<string, unknown>): { label: string; color: string } | null {
  if (!('exp' in payload)) return null;
  const exp = payload.exp as number;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    const ago = now - exp;
    const when = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : ago < 86400 ? `${Math.floor(ago / 3600)}h ago` : `${Math.floor(ago / 86400)}d ago`;
    return { label: `Expired ${when}`, color: 'text-red-500' };
  }
  const left = exp - now;
  const when = left < 60 ? `${left}s` : left < 3600 ? `${Math.floor(left / 60)}m` : left < 86400 ? `${Math.floor(left / 3600)}h` : `${Math.floor(left / 86400)}d`;
  return { label: `Expires in ${when}`, color: 'text-green-500' };
}

interface SectionProps {
  title: string;
  content: string;
}

function Section({ title, content }: SectionProps) {
  const clipboard = useClipboard({ timeout: 2000 });
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clipboard.copy(content)}
          className="h-7 px-2 text-xs gap-1.5"
        >
          {clipboard.copied
            ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
            : <><CopyIcon className="size-3" /> Copy</>}
        </Button>
      </div>
      <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-border">
        {content}
      </pre>
    </div>
  );
}

interface State {
  input: string;
  data: JWTData | null;
  error: string;
}

export default function JWTDecoderTool() {
  useToolVisit('dev', '/dev/jwt-decoder');

  const [state, update] = useImmer<State>({ input: '', data: null, error: '' });

  function handleInput(value: string) {
    update(d => {
      d.input = value;
      if (!value.trim()) {
        d.data = null;
        d.error = '';
        return;
      }
      try {
        d.data = decodeJWT(value);
        d.error = '';
      } catch (e) {
        d.data = null;
        d.error = e instanceof Error ? e.message : 'Invalid JWT';
      }
    });
  }

  const expiry = state.data ? expiryStatus(state.data.payload) : null;

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="jwt-input">JWT Token</Label>
            {state.data && !state.error && (
              <span className="flex items-center gap-1.5 text-xs text-green-500">
                <CheckCircleIcon className="size-3.5" /> Valid JWT
              </span>
            )}
            {state.error && (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <WarningCircleIcon className="size-3.5" /> {state.error}
              </span>
            )}
          </div>
          <Textarea
            id="jwt-input"
            rows={4}
            value={state.input}
            onChange={e => handleInput(e.target.value)}
            spellCheck={false}
            className="resize-none font-mono text-xs"
            placeholder="Paste your JWT token here… eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.xxx"
          />
        </CardContent>
      </Card>

      {/* Decoded sections */}
      {state.data && (
        <div className="space-y-4">
          {/* Expiry banner */}
          {expiry && (
            <Card>
              <CardContent className="pt-4 pb-3">
                <span className={`text-sm font-medium ${expiry.color}`}>{expiry.label}</span>
                {state.data.payload.iat !== undefined && (
                  <span className="text-xs text-muted-foreground ml-3">
                    Issued: {new Date((state.data.payload.iat as number) * 1000).toLocaleString()}
                  </span>
                )}
              </CardContent>
            </Card>
          )}
          {!expiry && state.data.payload.iat !== undefined && (
            <Card>
              <CardContent className="pt-4 pb-3">
                <span className="text-xs text-muted-foreground">
                  Issued: {new Date((state.data.payload.iat as number) * 1000).toLocaleString()} · No expiry claim
                </span>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-5 pb-4 space-y-5">
              <Section
                title="Header"
                content={JSON.stringify(state.data.header, null, 2)}
              />
              <Section
                title="Payload"
                content={JSON.stringify(state.data.payload, null, 2)}
              />
              <Section
                title="Signature (base64url)"
                content={state.data.signature}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
