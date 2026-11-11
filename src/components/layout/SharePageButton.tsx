import { useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { CheckIcon, CopyIcon, ExportIcon, ShareFatIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import QrCode from '@/components/shared/QrCode';
import { cn } from '@/lib/utils/cn';
import { shareableUrl } from '@/lib/utils/shareUrl';

interface Shared {
  url: string;
  title: string;
  /** The browser's own share sheet (phones, Safari, Edge…). */
  native: boolean;
}

/** Share the current page by QR code, link, or the system share sheet. */
export default function SharePageButton({ className }: { className?: string }) {
  // Read when opened, so it's always the page as it is now (and never on the server)
  const [shared, setShared] = useState<Shared | null>(null);
  const clipboard = useClipboard({ timeout: 2000 });

  const open = () => setShared({
    url: shareableUrl(location.href),
    title: document.title,
    native: typeof navigator.share === 'function',
  });

  const shareNatively = async () => {
    if (!shared) return;
    try {
      await navigator.share({ title: shared.title, url: shared.url });
      setShared(null);
    } catch {
      // Closing the share sheet without picking anything isn't an error
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Share this page" className={cn('size-7', className)} onClick={open}>
            <ExportIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Share this page</TooltipContent>
      </Tooltip>

      <Dialog open={shared !== null} onOpenChange={o => { if (!o) setShared(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Share this page</DialogTitle>
            <DialogDescription className="break-words">{shared?.title}</DialogDescription>
          </DialogHeader>
          {shared && (
            <div className="space-y-4 min-w-0">
              <div className="flex justify-center">
                <QrCode value={shared.url} label="QR code for this page" />
              </div>
              <p className="text-sm text-muted-foreground text-center">Scan with a phone camera to open this page there.</p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  aria-label="Page link"
                  value={shared.url}
                  className="flex-1 min-w-0 font-mono text-xs"
                  // On click rather than focus: the dialog focuses this field when it opens
                  onClick={e => e.currentTarget.select()}
                />
                <Button variant="secondary" size="sm" className="shrink-0" onClick={() => clipboard.copy(shared.url)}>
                  {clipboard.copied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
                  {clipboard.copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {shared.native && (
                <Button className="w-full" onClick={() => void shareNatively()}>
                  <ShareFatIcon className="size-4" /> Share…
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
