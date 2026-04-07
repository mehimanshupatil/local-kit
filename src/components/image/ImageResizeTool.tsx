import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { Resizable } from 're-resizable';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { resizeImage, type ResizeMode } from '@/lib/image/imageResize';
import { formatFileSize, generateId } from '@/lib/utils/fileUtils';

interface FileEntry { id: string; file: File; preview: string; w: number; h: number }

const PRESETS = [
  { label: 'HD',       w: 1280, h: 720  },
  { label: 'Full HD',  w: 1920, h: 1080 },
  { label: '4K',       w: 3840, h: 2160 },
  { label: 'Square',   w: 1080, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Twitter',  w: 1200, h: 675  },
  { label: 'OG Image', w: 1200, h: 630  },
  { label: '480p',     w: 854,  h: 480  },
];

/** Shared handle style for re-resizable */
const HANDLE_STYLE: React.CSSProperties = {
  width: 12, height: 12, borderRadius: 2,
  background: '#fff', border: '2px solid #0ea5e9',
  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
};

const PREVIEW_W = 400;
const PREVIEW_H = 280;

export default function ImageResizeTool() {
  const [files, setFiles]     = useState<FileEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [width,  setWidth]    = useState(1920);
  const [height, setHeight]   = useState(1080);
  const [locked, setLocked]   = useState(true);
  const [mode,   setMode]     = useState<ResizeMode>('fit');
  const [status, setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput] = useState<OutputFile[]>([]);
  const [error,    setError]  = useState('');
  const active = files[activeIdx] ?? null;

  // Scale factor: how many display-px = 1 source-px
  const previewScale = active
    ? Math.min(PREVIEW_W / active.w, PREVIEW_H / active.h, 1)
    : 1;
  const imgDisplayW = active ? Math.round(active.w * previewScale) : PREVIEW_W;
  const imgDisplayH = active ? Math.round(active.h * previewScale) : PREVIEW_H;

  // Box display size
  const rawBoxW = Math.round(width  * previewScale);
  const rawBoxH = Math.round(height * previewScale);
  const boxW = Math.min(rawBoxW, PREVIEW_W);
  const boxH = Math.min(rawBoxH, PREVIEW_H);

  // ── File handling ──────────────────────────────────────────────
  const addFiles = (incoming: File[]) => {
    const imgs = incoming.filter(f => f.type.startsWith('image/'));
    Promise.all(imgs.map(f => new Promise<FileEntry>(res => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => res({ id: generateId(), file: f, preview: url, w: img.naturalWidth, h: img.naturalHeight });
      img.src = url;
    }))).then(entries => {
      setFiles(prev => {
        if (prev.length === 0 && entries.length > 0) {
          setWidth(entries[0].w);
          setHeight(entries[0].h);
        }
        return [...prev, ...entries];
      });
      setStatus('idle'); setOutput([]);
    });
  };

  const handleWidth = (v: number) => {
    setWidth(v);
    if (locked && active) setHeight(Math.round(v / (active.w / active.h)));
  };
  const handleHeight = (v: number) => {
    setHeight(v);
    if (locked && active) setWidth(Math.round(v * (active.w / active.h)));
  };

  const applyPreset = (w: number, h: number) => { setWidth(w); setHeight(h); };

  // ── Process ────────────────────────────────────────────────────
  const resize = async () => {
    if (!files.length) return;
    setStatus('processing'); setProgress(0); setError('');
    const results: OutputFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const r = await resizeImage(files[i].file, { width, height, mode });
        results.push({ name: r.name, blob: r.blob, size: r.blob.size });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      setOutput(results); setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resize failed'); setStatus('error');
    }
  };

  const reset = () => { files.forEach(f => URL.revokeObjectURL(f.preview)); setFiles([]); setOutput([]); setStatus('idle'); };

  return (
    <div className="space-y-5">
      {files.length === 0 ? (
        <DropZone onFiles={addFiles} accept="image/*" label="Drop images to resize" sublabel="JPEG, PNG, WebP — batch supported" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ════ LEFT: Interactive Preview ════ */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Preview <span className="text-xs font-normal text-gray-400 ml-1">drag handles to resize</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={reset} className="text-gray-400 hover:text-red-500">Clear all</Button>
            </div>

            {/* Canvas area */}
            <div
              className="relative rounded-xl overflow-hidden flex items-center justify-center select-none"
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                maxWidth: '100%',
                background: 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 0 0 / 16px 16px',
              }}
            >
              {active && (
                <>
                  {/* Source image */}
                  <img
                    src={active.preview}
                    draggable={false}
                    style={{ width: imgDisplayW, height: imgDisplayH, display: 'block' }}
                    className="object-cover rounded pointer-events-none"
                    alt="source"
                  />

                  {/* Output box — re-resizable handles all drag logic */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Resizable
                      size={{ width: boxW, height: boxH }}
                      minWidth={20}
                      minHeight={20}
                      maxWidth={PREVIEW_W}
                      maxHeight={PREVIEW_H}
                      lockAspectRatio={locked}
                      onResizeStop={(_e, _dir, _ref, delta) => {
                        const nw = Math.max(1, Math.round((boxW + delta.width)  / previewScale));
                        const nh = Math.max(1, Math.round((boxH + delta.height) / previewScale));
                        setWidth(nw);
                        setHeight(nh);
                      }}
                      handleStyles={{
                        topLeft:     { ...HANDLE_STYLE, top: -6,  left: -6  },
                        top:         { ...HANDLE_STYLE, top: -6,  left: '50%', transform: 'translateX(-50%)' },
                        topRight:    { ...HANDLE_STYLE, top: -6,  right: -6 },
                        right:       { ...HANDLE_STYLE, top: '50%', right: -6, transform: 'translateY(-50%)' },
                        bottomRight: { ...HANDLE_STYLE, bottom: -6, right: -6 },
                        bottom:      { ...HANDLE_STYLE, bottom: -6, left: '50%', transform: 'translateX(-50%)' },
                        bottomLeft:  { ...HANDLE_STYLE, bottom: -6, left: -6 },
                        left:        { ...HANDLE_STYLE, top: '50%', left: -6, transform: 'translateY(-50%)' },
                      }}
                      className="relative"
                    >
                      {/* Vignette */}
                      <div className="absolute inset-0 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)] pointer-events-none z-0" />
                      {/* Border */}
                      <div className="absolute inset-0 border-2 border-white pointer-events-none z-10" />
                      {/* Rule-of-thirds */}
                      <div className="absolute inset-0 z-10 pointer-events-none opacity-40">
                        <div className="absolute top-1/3 left-0 right-0 border-t border-white/60" />
                        <div className="absolute top-2/3 left-0 right-0 border-t border-white/60" />
                        <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/60" />
                        <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/60" />
                      </div>
                      {/* Label */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                        <span className="text-white text-xs font-mono bg-black/60 px-2 py-0.5 rounded-md whitespace-nowrap">
                          {width} × {height}px
                        </span>
                      </div>
                    </Resizable>
                  </div>
                </>
              )}
            </div>

            {/* Overflow indicator */}
            {active && (rawBoxW > PREVIEW_W || rawBoxH > PREVIEW_H) && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                ⚠ Output ({width}×{height}) larger than source — box is clipped in preview
              </p>
            )}

            {/* Thumbnail strip */}
            {files.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {files.map((f, i) => (
                  <button key={f.id} type="button" onClick={() => setActiveIdx(i)}
                    className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${activeIdx === i ? 'border-brand-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    <img src={f.preview} className="w-14 h-10 object-cover" />
                  </button>
                ))}
                <label className="shrink-0 w-14 h-10 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-brand-400 transition-colors text-lg cursor-pointer">
                  +
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => e.target.files && addFiles(Array.from(e.target.files))} />
                </label>
              </div>
            )}

            {active && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Original: {active.w}×{active.h}px · {formatFileSize(active.file.size)}
                {files.length > 1 && <span className="ml-2">{files.length} files total</span>}
              </p>
            )}
          </div>

          {/* ════ RIGHT: Controls ════ */}
          <div className="space-y-4">

            {/* Dimensions */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Output Dimensions</h3>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="label">Width (px)</label>
                  <input type="number" min={1} max={9999} value={width}
                    onChange={e => handleWidth(parseInt(e.target.value) || 1)} className="input" />
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLocked(l => !l)}
                  title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  className={`mb-0.5 transition-all ${locked ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400' : 'text-gray-400'}`}
                >
                  {locked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                </Button>

                <div className="flex-1">
                  <label className="label">Height (px)</label>
                  <input type="number" min={1} max={9999} value={height}
                    onChange={e => handleHeight(parseInt(e.target.value) || 1)} className="input" />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Ratio: {(width / Math.max(height, 1)).toFixed(2)}:1
                {locked && <span className="ml-2 text-brand-500 dark:text-brand-400">🔒 aspect ratio locked</span>}
              </p>
            </div>

            {/* Presets */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Quick Presets</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map(p => (
                  <Button key={p.label} variant="outline" onClick={() => applyPreset(p.w, p.h)}
                    className={`h-auto flex-col py-1.5 px-1 text-xs transition-all ${width === p.w && height === p.h ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}>
                    <div className="font-semibold">{p.label}</div>
                    <div className="opacity-60">{p.w}×{p.h}</div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="card p-4 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resize Mode</h3>
              {([
                { m: 'fit'   as ResizeMode, icon: '↔', label: 'Fit',   desc: 'Scale to fit, keep aspect ratio' },
                { m: 'fill'  as ResizeMode, icon: '⊡', label: 'Fill',  desc: 'Crop to fill exact dimensions' },
                { m: 'exact' as ResizeMode, icon: '⇲', label: 'Exact', desc: 'Stretch to exact size' },
              ]).map(({ m, icon, label, desc }) => (
                <Button key={m} variant="outline" onClick={() => setMode(m)}
                  className={`w-full h-auto justify-start gap-3 px-3 py-2.5 text-left transition-all ${mode === m ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30' : ''}`}>
                  <span className="text-xl w-6 text-center">{icon}</span>
                  <div>
                    <p className={`text-sm font-medium ${mode === m ? 'text-brand-700 dark:text-brand-300' : 'text-gray-800 dark:text-gray-200'}`}>{label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                  </div>
                </Button>
              ))}
            </div>

            {status === 'processing' && <ProgressBar progress={progress} label="Resizing images..." />}
            {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

            <Button onClick={resize} disabled={status === 'processing'} size="lg" className="w-full">
              {status === 'processing' ? 'Resizing...' : `Resize ${files.length > 1 ? `${files.length} images` : 'image'} → ${width}×${height}`}
            </Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
