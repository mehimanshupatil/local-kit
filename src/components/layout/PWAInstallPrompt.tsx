import { useState } from 'react';
import { useDisclosure, useLocalStorage, useWindowEvent } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { XIcon, ArrowsCounterClockwiseIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const SW_POLL_INTERVAL = 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, { open: openInstall, close: closeInstall }] = useDisclosure(false);
  const [pwaDismissed, setPwaDismissed] = useLocalStorage({ key: 'pwa-dismissed', defaultValue: '' });

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      r && setInterval(() => r.update(), SW_POLL_INTERVAL);
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  useWindowEvent('beforeinstallprompt', (e) => {
    if (pwaDismissed) return;
    e.preventDefault();
    setInstallPrompt(e as unknown as BeforeInstallPromptEvent);
    openInstall();
  });

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') closeInstall();
    setInstallPrompt(null);
  };

  const dismissInstall = () => {
    closeInstall();
    setPwaDismissed('1');
  };

  const dismissStatus = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const showStatus = offlineReady || needRefresh;

  if (!showInstall && !showStatus) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 flex flex-col gap-2 animate-slide-up">
      {showStatus && (
        <div className="bg-card rounded-xl border border-border shadow-xl p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {needRefresh ? (
              <>
                <p className="font-semibold text-foreground text-sm">Update available</p>
                <p className="text-xs text-muted-foreground mt-0.5">Reload to get the latest version.</p>
                <div className="flex gap-2 mt-3">
                  <Button onClick={() => updateServiceWorker(true)} variant="default" size="sm">
                    <ArrowsCounterClockwiseIcon className="size-3" /> Reload
                  </Button>
                  <Button onClick={dismissStatus} variant="secondary" size="sm">
                    Later
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-foreground text-sm">Ready to work offline</p>
                <p className="text-xs text-muted-foreground mt-0.5">LocalKit is cached and works without internet.</p>
              </>
            )}
          </div>
          <Button onClick={dismissStatus} variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0 size-7">
            <XIcon className="size-4" />
          </Button>
        </div>
      )}

      {showInstall && (
        <div className="bg-card rounded-xl border border-border shadow-xl p-4 flex items-start gap-3">
          <img src="/icon.svg" alt="LocalKit" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Install LocalKit</p>
            <p className="text-xs text-muted-foreground mt-0.5">Works offline · No uploads · Free</p>
            <div className="flex gap-2 mt-3">
              <Button onClick={install} variant="default" size="sm">
                <DownloadSimpleIcon className="size-3" /> Install
              </Button>
              <Button onClick={dismissInstall} variant="secondary" size="sm">
                Not now
              </Button>
            </div>
          </div>
          <Button onClick={dismissInstall} variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0 size-7">
            <XIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
