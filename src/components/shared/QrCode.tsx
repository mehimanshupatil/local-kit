import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils/cn';

/** A QR code for `value`, drawn in the browser. Dark on white whatever the theme: phone cameras read that most reliably. */
export default function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void QRCode.toDataURL(value, { margin: 2, width: 440, errorCorrectionLevel: 'M' }).then(url => { if (current) setSrc(url); });
    return () => { current = false; };
  }, [value]);

  return src
    ? <img src={src} alt={label} className={cn('size-52 rounded-lg bg-white', className)} />
    : <div role="img" aria-label={label} className={cn('size-52 rounded-lg bg-secondary', className)} />;
}
