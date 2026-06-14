import { useState, useEffect, useRef } from 'react';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { generateQRDataURL, generateQRSVG } from '@/lib/dev/qrCode';
import type { QROptions, ErrorCorrectionLevel } from '@/lib/dev/qrCode';
import { Copy, Check, DownloadSimple } from '@phosphor-icons/react';

const EC_LEVELS: { value: ErrorCorrectionLevel; label: string; desc: string }[] = [
  { value: 'L', label: 'L', desc: '7% recovery' },
  { value: 'M', label: 'M', desc: '15% recovery' },
  { value: 'Q', label: 'Q', desc: '25% recovery' },
  { value: 'H', label: 'H', desc: '30% recovery' },
];

const DEFAULT_OPTS: QROptions = {
  errorCorrection: 'M',
  size: 400,
  margin: 4,
  darkColor: '#000000',
  lightColor: '#ffffff',
};

export default function QRCodeTool() {
  const [text, setText] = useState('');
  const [opts, setOpts] = useState<QROptions>(DEFAULT_OPTS);
  const [dataUrl, setDataUrl] = useState('');
  const [svgString, setSvgString] = useState('');
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboard = useClipboard({ timeout: 2000 });

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setDataUrl('');
      setSvgString('');
      setError('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setError('');
        const [url, svg] = await Promise.all([
          generateQRDataURL(text, opts),
          generateQRSVG(text, opts),
        ]);
        setDataUrl(url);
        setSvgString(svg);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to generate QR code');
        setDataUrl('');
        setSvgString('');
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, opts]);

  function downloadPng() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'qrcode.png';
    a.click();
  }

  function downloadSvg() {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcode.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPng() {
    if (!dataUrl) return;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      clipboard.copy('');
    } catch {
      // fallback: copy data url as text
      clipboard.copy(dataUrl);
    }
  }

  function updateOpt<K extends keyof QROptions>(key: K, value: QROptions[K]) {
    setOpts(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <Label htmlFor="qr-input">Text or URL</Label>
          <textarea
            id="qr-input"
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter text or URL…"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent resize-none transition-all"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Options */}
        <Card>
          <CardContent className="pt-5 pb-4 space-y-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Options</p>

            {/* Error Correction */}
            <div className="space-y-2">
              <Label>Error Correction</Label>
              <div className="flex gap-2 flex-wrap">
                {EC_LEVELS.map(ec => (
                  <button
                    key={ec.value}
                    onClick={() => updateOpt('errorCorrection', ec.value)}
                    className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      opts.errorCorrection === ec.value
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className="text-sm font-bold">{ec.label}</span>
                    <span className="text-gray-400 dark:text-gray-500 font-normal">{ec.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="space-y-2">
              <Label>Size: {opts.size}px</Label>
              <Slider
                min={128}
                max={1024}
                step={32}
                value={[opts.size]}
                onValueChange={([v]) => updateOpt('size', v)}
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>128px</span>
                <span>1024px</span>
              </div>
            </div>

            {/* Margin */}
            <div className="space-y-2">
              <Label htmlFor="qr-margin">Margin (modules)</Label>
              <input
                id="qr-margin"
                type="number"
                min={0}
                max={10}
                value={opts.margin}
                onChange={e => updateOpt('margin', Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                className="input w-24"
              />
            </div>

            {/* Colors */}
            <div className="flex gap-6">
              <div className="space-y-2">
                <Label htmlFor="qr-dark">Dark color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="qr-dark"
                    type="color"
                    value={opts.darkColor}
                    onChange={e => updateOpt('darkColor', e.target.value)}
                    className="h-9 w-12 rounded cursor-pointer border border-gray-200 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500">{opts.darkColor}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-light">Light color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="qr-light"
                    type="color"
                    value={opts.lightColor}
                    onChange={e => updateOpt('lightColor', e.target.value)}
                    className="h-9 w-12 rounded cursor-pointer border border-gray-200 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-900"
                  />
                  <span className="text-xs font-mono text-gray-500">{opts.lightColor}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</p>

            <div className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 min-h-64 p-4">
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400 text-center px-4">{error}</p>
              ) : dataUrl ? (
                <img
                  src={dataUrl}
                  alt="QR Code"
                  className="max-w-full max-h-64 rounded"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 select-none">
                  Enter text to generate a QR code
                </p>
              )}
            </div>

            {dataUrl && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadPng} className="gap-2">
                  <DownloadSimple className="size-4" /> Download PNG
                </Button>
                <Button variant="secondary" onClick={downloadSvg} className="gap-2">
                  <DownloadSimple className="size-4" /> Download SVG
                </Button>
                <Button variant="ghost" onClick={copyPng} className="gap-2">
                  {clipboard.copied
                    ? <><Check className="size-4 text-green-500" /> Copied</>
                    : <><Copy className="size-4" /> Copy PNG</>
                  }
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
