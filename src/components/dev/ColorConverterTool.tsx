import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToolVisit } from '@/stores/toolVisit';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import {
  fromHex, hexToRgb, rgbToHex, parseRgb, parseHsl, hslToRgb,
  type ColorFormats,
} from '@/lib/dev/colorConverter';

interface State {
  hex: string;
  alpha: number; // 0–1
  formats: ColorFormats | null;
}

function FormatRow({ label, value }: { label: string; value: string }) {
  const clipboard = useClipboard({ timeout: 1500 });
  return (
    <button
      onClick={() => clipboard.copy(value)}
      className="flex items-center justify-between w-full rounded border border-border px-3 py-2.5 hover:bg-secondary transition-colors group text-left"
      title={`Copy ${label}`}
    >
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">{label}</p>
        <p className="text-sm font-mono text-foreground">{value}</p>
      </div>
      <span className="text-muted-foreground group-hover:text-foreground transition-colors ml-3 shrink-0">
        {clipboard.copied
          ? <CheckIcon className="size-4 text-brand-500" />
          : <CopyIcon className="size-4" />}
      </span>
    </button>
  );
}

export default function ColorConverterTool() {
  useToolVisit('dev', '/dev/color-converter');

  const [state, update] = useImmer<State>({
    hex: '#10b981',
    alpha: 1,
    formats: fromHex('#10b981', 1),
  });

  function recompute(hex: string, alpha: number) {
    update(d => { d.hex = hex; d.alpha = alpha; d.formats = fromHex(hex, alpha); });
  }

  function handleHexInput(value: string) {
    update(d => { d.hex = value; });
    const normalized = value.startsWith('#') ? value : '#' + value;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
      recompute(normalized, state.alpha);
    }
  }

  function handleRgbInput(value: string) {
    const rgb = parseRgb(value);
    if (rgb) recompute(rgbToHex(...rgb), state.alpha);
  }

  function handleHslInput(value: string) {
    const hsl = parseHsl(value);
    if (hsl) recompute(rgbToHex(...hslToRgb(...hsl)), state.alpha);
  }

  const rgb = hexToRgb(state.formats?.hex ?? state.hex);
  const previewStyle = rgb
    ? { backgroundColor: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${state.alpha})` }
    : {};

  // checkerboard for transparency preview
  const checkerStyle = {
    backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)',
    backgroundSize: '16px 16px',
  };

  return (
    <div className="space-y-4">
      {/* Picker + alpha */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <div className="flex flex-wrap gap-6 items-start">
            <div className="space-y-2">
              <Label>Color Picker</Label>
              <input
                type="color"
                value={state.formats?.hex ?? '#000000'}
                onChange={e => recompute(e.target.value, state.alpha)}
                className="h-14 w-20 rounded cursor-pointer border border-border p-0.5 bg-card"
              />
            </div>

            <div className="space-y-2 w-40">
              <Label htmlFor="hex-input">HEX</Label>
              <Input
                id="hex-input"
                value={state.hex}
                onChange={e => handleHexInput(e.target.value)}
                className="font-mono"
                placeholder="#10b981"
              />
            </div>

            {/* Preview swatch with checkerboard under it */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="h-14 w-28 rounded border border-border overflow-hidden" style={checkerStyle}>
                <div className="w-full h-full" style={previewStyle} />
              </div>
            </div>
          </div>

          {/* Alpha slider */}
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Alpha</span>
              <span className="font-mono text-muted-foreground">{Math.round(state.alpha * 100)}%</span>
            </Label>
            <Slider
              min={0} max={1} step={0.01}
              value={[state.alpha]}
              onValueChange={(v) => recompute(state.formats?.hex ?? state.hex, Array.isArray(v) ? v[0] : v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Format outputs */}
      {state.formats && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Click any format to copy</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormatRow label="HEX" value={state.formats.hex} />
              <FormatRow label="HEX + Alpha" value={state.formats.hexAlpha} />
              <FormatRow label="RGB" value={state.formats.rgb} />
              <FormatRow label="RGBA" value={state.formats.rgba} />
              <FormatRow label="HSL" value={state.formats.hsl} />
              <FormatRow label="HSLA" value={state.formats.hsla} />
              <FormatRow label="OKLCH" value={state.formats.oklch} />
              <FormatRow label="OKLCH + Alpha" value={state.formats.oklcha} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual input */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <p className="text-sm font-semibold text-foreground">Type in any format to convert</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">RGB / RGBA</Label>
              <Input className="font-mono text-sm" placeholder="rgb(16 185 129)"
                onBlur={e => handleRgbInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRgbInput((e.target as HTMLInputElement).value); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">HSL / HSLA</Label>
              <Input className="font-mono text-sm" placeholder="hsl(160 84% 39%)"
                onBlur={e => handleHslInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleHslInput((e.target as HTMLInputElement).value); }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Press Enter or blur to update</p>
        </CardContent>
      </Card>
    </div>
  );
}
