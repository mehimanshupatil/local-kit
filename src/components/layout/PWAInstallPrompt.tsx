import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, RefreshCw, Download } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const SW_POLL_INTERVAL = 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

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

  useEffect(() => {
    if (localStorage.getItem('pwa-dismissed')) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstall(false);
    setInstallPrompt(null);
  };

  const dismissInstall = () => {
    setShowInstall(false);
    localStorage.setItem('pwa-dismissed', '1');
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
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {needRefresh ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">Update available</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Reload to get the latest version.</p>
                <div className="flex gap-2 mt-3">
                  <Button onClick={() => updateServiceWorker(true)} className="btn-primary text-xs py-1.5 px-3 gap-1.5">
                    <RefreshCw className="w-3 h-3" /> Reload
                  </Button>
                  <Button onClick={dismissStatus} className="btn-secondary text-xs py-1.5 px-3">
                    Later
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">Ready to work offline</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">LocalKit is cached and works without internet.</p>
              </>
            )}
          </div>
          <Button onClick={dismissStatus} variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 size-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {showInstall && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 flex items-start gap-3">
          <img src="/icon.svg" alt="LocalKit" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">Install LocalKit</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Works offline · No uploads · Free</p>
            <div className="flex gap-2 mt-3">
              <Button onClick={install} className="btn-primary text-xs py-1.5 px-3 gap-1.5">
                <Download className="w-3 h-3" /> Install
              </Button>
              <Button onClick={dismissInstall} className="btn-secondary text-xs py-1.5 px-3">
                Not now
              </Button>
            </div>
          </div>
          <Button onClick={dismissInstall} variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 size-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
