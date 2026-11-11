import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  DesktopIcon, DeviceMobileIcon, DeviceTabletIcon, EyeSlashIcon, LinkSimpleIcon, PencilSimpleIcon, QrCodeIcon, SpinnerIcon,
  WarningCircleIcon, WifiSlashIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MAX_NAME_LENGTH, cleanName, type DeviceKind, type Profile } from '@/lib/share/device';
import type { Peer } from '@/lib/share/session';
import PairDialog from './PairDialog';
import type { ShareSessionState } from './useShareSession';

/** This device, its visibility, connection notices, the device list, and pairing — the same on every Share tool. */
export default function DevicePanel({ share, hint, visibilityLocked, renderDevice }: {
  share: ShareSessionState;
  /** How to use the device list on this tool. */
  hint: ReactNode;
  /** Hiding leaves the room, which would cut off whatever is in progress. */
  visibilityLocked: boolean;
  renderDevice: (peer: Peer) => ReactNode;
}) {
  const { profile, connection, online, peers, pairing } = share;

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        {profile && (
          <Identity
            profile={profile}
            onRename={share.rename}
            visible={share.visible}
            visibilityLocked={visibilityLocked}
            onVisibleChange={share.setVisible}
          />
        )}

        {connection.status !== 'hidden' && <p className="text-sm text-muted-foreground">{hint}</p>}

        {(!online || connection.status === 'offline') && (
          <Notice icon={WifiSlashIcon} tone="warning">
            You're offline. Finding and connecting to other devices needs an internet connection — this page will
            reconnect when you're back online.
          </Notice>
        )}

        {connection.status === 'hidden' && (
          <Notice icon={EyeSlashIcon}>Hidden. Other devices can't find this one, and it isn't looking for them.</Notice>
        )}

        {share.connectionFailed && (
          <Notice icon={WarningCircleIcon} tone="warning" onDismiss={share.dismissConnectionFailed}>
            Found a device but couldn't connect to it directly. Some networks (guest Wi-Fi, VPNs, mobile
            hotspots) block direct connections — try putting both devices on the same Wi-Fi.
          </Notice>
        )}

        {connection.status === 'connecting' && online && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerIcon className="size-4 animate-spin" /> Connecting…
          </p>
        )}

        {connection.status === 'error' && <Notice icon={WarningCircleIcon} tone="error">{connection.message}</Notice>}

        {connection.status === 'ready' && online && peers.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SpinnerIcon className="size-4 animate-spin" /> Looking for nearby devices…
          </p>
        )}

        {peers.length > 0 && (
          <ul aria-label="Devices" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {peers.map(peer => <li key={peer.id}>{renderDevice(peer)}</li>)}
          </ul>
        )}

        {share.sessionReady && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <Button variant="secondary" size="sm" onClick={pairing.start}>
              <QrCodeIcon className="size-4" /> Pair a device
            </Button>
            <span className="text-xs text-muted-foreground">Not on the same network? Pair with a QR code or a code.</span>
          </div>
        )}

        <PairDialog
          open={pairing.open}
          tab={pairing.tab}
          state={pairing.state}
          onTabChange={pairing.changeTab}
          onClose={pairing.close}
          onShowCode={pairing.showCode}
          onEnterCode={pairing.enterCode}
          onConfirm={pairing.close}
          onReject={pairing.reject}
        />
      </CardContent>
    </Card>
  );
}

const DEVICE_ICONS = { phone: DeviceMobileIcon, tablet: DeviceTabletIcon, computer: DesktopIcon } as const;

export function DeviceIcon({ kind, className }: { kind: DeviceKind; className?: string }) {
  const Icon = DEVICE_ICONS[kind];
  return <Icon className={className} aria-hidden />;
}

/** Icon, name, browser and "Paired" badge for a device in the list; the tool supplies the button around it. */
export function DeviceSummary({ peer }: { peer: Peer }) {
  return (
    <>
      <DeviceIcon kind={peer.device.kind} className="size-8 text-brand-500" />
      <span className="text-center">
        <span className="block text-sm font-medium text-foreground break-words">{peer.name}</span>
        {peer.device.label && <span className="block text-xs text-muted-foreground">{peer.device.label}</span>}
        {peer.via === 'paired' && (
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-brand-500">
            <LinkSimpleIcon className="size-3" /> Paired
          </span>
        )}
      </span>
    </>
  );
}

const NOTICE_TONES = {
  info: 'text-muted-foreground bg-secondary',
  warning: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30',
  error: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30',
};

export function Notice({ icon: Icon, tone = 'info', onDismiss, children }: {
  icon: typeof WarningCircleIcon;
  tone?: keyof typeof NOTICE_TONES;
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${NOTICE_TONES[tone]}`}>
      <Icon className="size-4 shrink-0 mt-0.5" />
      <p className="flex-1">{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

function Identity({ profile, onRename, visible, visibilityLocked, onVisibleChange }: {
  profile: Profile;
  onRename: (name: string) => void;
  visible: boolean;
  visibilityLocked: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
        <DeviceIcon kind={profile.device.kind} className="size-8 text-brand-500 shrink-0" />
        {editing ? (
          <form
            className="flex flex-1 min-w-0 items-center gap-2"
            onSubmit={e => {
              e.preventDefault();
              onRename(draft);
              setEditing(false);
            }}
          >
            <Input
              autoFocus
              aria-label="Device name"
              value={draft}
              maxLength={MAX_NAME_LENGTH}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 min-w-0"
            />
            <Button type="submit" size="sm" className="shrink-0" disabled={!cleanName(draft)}>Save</Button>
            <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : (
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              You appear as <span className="font-semibold text-foreground break-words">{profile.name}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Rename this device"
                onClick={() => {
                  setDraft(profile.name);
                  setEditing(true);
                }}
              >
                <PencilSimpleIcon className="size-3.5" />
              </Button>
            </p>
            {profile.device.label && <p className="text-xs text-muted-foreground">{profile.device.label}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch id="share-visible" checked={visible} disabled={visibilityLocked} onCheckedChange={onVisibleChange} />
        <Label htmlFor="share-visible" className="text-sm">Visible to others</Label>
      </div>
    </div>
  );
}
