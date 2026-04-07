import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('pwa-dismissed')) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show || dismissed) return null;

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    setShow(false);
    localStorage.setItem('pwa-dismissed', '1');
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 animate-slide-up">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-4 flex items-start gap-3">
        <img src="/icon.svg" alt="LocalKit" className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">Install LocalKit</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Works offline · No uploads · Free</p>
          <div className="flex gap-2 mt-3">
            <Button onClick={install} className="btn-primary text-xs py-1.5 px-3">
              Install
            </Button>
            <Button onClick={dismiss} className="btn-secondary text-xs py-1.5 px-3">
              Not now
            </Button>
          </div>
        </div>
        <Button onClick={dismiss} variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 size-7">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
