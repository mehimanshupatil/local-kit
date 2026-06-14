import { useState, useRef, useEffect, useCallback } from 'react';
import { useImmer } from 'use-immer';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import { castDraft } from 'immer';
import type Konva from 'konva';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import ProgressBar from '@/components/shared/ProgressBar';
import PDFFileBar from './PDFFileBar';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { renderPageToCanvas, embedAnnotationOnPage } from '@/lib/pdf/pdfAnnotate';
import { useToolVisit } from '@/stores/toolVisit';
import { generateId, stripExtension } from '@/lib/utils/fileUtils';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { CaretLeftIcon, CaretRightIcon, TrashIcon, PlusIcon } from '@phosphor-icons/react';

interface SignatureItem {
  id: string;
  dataUrl: string;
  x: number; y: number;
  width: number; height: number;
}

function typedSigToDataUrl(name: string): string {
  const c = document.createElement('canvas');
  c.width = 500; c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'italic bold 64px Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, 80);
  return c.toDataURL('image/png');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Draw pad with stroke size ──────────────────────────────────────────────────

function DrawPad({ strokeSize, onReady }: { strokeSize: number; onReady: (url: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.currentTarget.width / r.width;
    const sy = e.currentTarget.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; hasDrawn.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    onReady(null);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = strokeSize * 2; // canvas is 2x resolution
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const onUp = () => {
    drawing.current = false;
    if (hasDrawn.current && ref.current) onReady(ref.current.toDataURL('image/png'));
  };

  const clear = () => {
    const c = ref.current; if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false; onReady(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        width={800} height={300}
        className="w-full rounded-lg border-2 border-dashed border-border bg-white touch-none cursor-crosshair"
        style={{ maxWidth: '100%' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      />
      <Button variant="outline" size="sm" onClick={clear}>Clear</Button>
    </div>
  );
}

// ── Placed signature with transformer ────────────────────────────────────────

function PlacedSig({ sig, selected, onSelect, onChange }: {
  sig: SignatureItem; selected: boolean;
  onSelect: () => void; onChange: (u: Partial<SignatureItem>) => void;
}) {
  const imgRef = useRef<Konva.Image>(null);
  const trRef  = useRef<Konva.Transformer>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = new window.Image();
    el.onload = () => setImgEl(el);
    el.src = sig.dataUrl;
  }, [sig.dataUrl]);

  useEffect(() => {
    if (selected && trRef.current && imgRef.current) {
      trRef.current.nodes([imgRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  if (!imgEl) return null;

  return (
    <>
      <KonvaImage
        ref={imgRef} image={imgEl}
        x={sig.x} y={sig.y} width={sig.width} height={sig.height}
        draggable
        shadowColor="rgba(0,0,0,0.3)" shadowBlur={selected ? 8 : 0} shadowOffset={{ x: 2, y: 2 }}
        onClick={onSelect} onTap={onSelect}
        onDragEnd={e => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const n = imgRef.current!;
          onChange({ x: n.x(), y: n.y(), width: Math.max(20, n.width() * n.scaleX()), height: Math.max(20, n.height() * n.scaleY()) });
          n.scaleX(1); n.scaleY(1);
        }}
      />
      {selected && (
        <Transformer ref={trRef}
          boundBoxFunc={(o, n) => (n.width < 20 || n.height < 20 ? o : n)}
          keepRatio={false}
        />
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PDFSignTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/sign');

  const [file, setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [pdf,  setPdf]      = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage]     = useState(1);
  const [scale, setScale]   = useState(1);
  const [dims, setDims]     = useState({ w: 800, h: 1000 });

  const [sigTab,    setSigTab]    = useState('draw');
  const [drawUrl,   setDrawUrl]   = useState<string | null>(null);
  const [typedName, setTypedName] = useState('');
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [strokeSize, setStrokeSize] = useState(2);

  const [pageSigs, updatePageSigs] = useImmer<Record<number, SignatureItem[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  // Restore session
  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { handleFiles([sessionFiles[0]]); } catch {}
    }
  }, []);

  // Re-render page whenever page number or pdf changes
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    renderPageToCanvas(pdf, page, canvasRef.current).then(({ scale: s, dims: d }) => {
      setScale(s);
      setDims({ w: d.width * s, h: d.height * s });
    });
  }, [pdf, page]);

  const handleFiles = async ([f]: File[]) => {
    updateOp(d => { d.status = 'loading'; d.error = ''; });
    try {
      const buf = await f.arrayBuffer();
      const doc = await loadPDFDocument(buf.slice(0));
      setFile({ name: f.name, size: f.size, buffer: buf });
      setPdf(doc); setPageCount(doc.numPages);
      setSessionFiles([f]);
      updateOp(d => { d.status = 'idle'; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Failed'; });
    }
  };

  const reset = () => {
    setFile(null); setPdf(null); setPageCount(0); setPage(1);
    updatePageSigs(() => ({})); setSelectedId(null);
    updateOp(() => ({ ...IDLE_OP })); clearSession();
  };

  const activeSigUrl = useCallback((): string | null => {
    if (sigTab === 'draw')   return drawUrl;
    if (sigTab === 'type')   return typedName.trim() ? typedSigToDataUrl(typedName.trim()) : null;
    if (sigTab === 'upload') return uploadUrl;
    return null;
  }, [sigTab, drawUrl, typedName, uploadUrl]);

  const placeSig = () => {
    const url = activeSigUrl();
    if (!url) return;
    const sig: SignatureItem = { id: generateId(), dataUrl: url, x: dims.w * 0.1, y: dims.h * 0.75, width: 200, height: 70 };
    updatePageSigs(d => { if (!d[page]) d[page] = []; d[page].push(castDraft(sig)); });
    setSelectedId(sig.id);
  };

  const exportPDF = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; d.output = []; });
    try {
      const annotatedPages = Object.keys(pageSigs).map(Number).filter(p => (pageSigs[p]?.length ?? 0) > 0);
      if (annotatedPages.length === 0) throw new Error('No signatures placed yet.');

      let buf = file.buffer.slice(0);

      for (let i = 0; i < annotatedPages.length; i++) {
        const p = annotatedPages[i];
        const sigs = pageSigs[p] ?? [];

        const offscreen = document.createElement('canvas');
        const doc2 = await loadPDFDocument(buf.slice(0));
        const { scale: s } = await renderPageToCanvas(doc2, p, offscreen);

        const ann = document.createElement('canvas');
        ann.width = offscreen.width; ann.height = offscreen.height;
        const ctx = ann.getContext('2d')!;

        await Promise.all(sigs.map(sig => new Promise<void>(res => {
          const el = new window.Image();
          el.onload = () => { ctx.drawImage(el, sig.x, sig.y, sig.width, sig.height); res(); };
          el.src = sig.dataUrl;
        })));

        const blob = await embedAnnotationOnPage(buf, p - 1, ann.toDataURL('image/png'), s);
        buf = await blob.arrayBuffer();
        updateOp(d => { d.progress = Math.round(((i + 1) / annotatedPages.length) * 95); });
      }

      const final = new Blob([buf], { type: 'application/pdf' });
      updateOp(d => { d.status = 'done'; d.progress = 100; d.output = [{ name: `${stripExtension(file.name)}_signed.pdf`, blob: final, size: final.size }]; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Export failed'; });
    }
  };

  const pageSigCount = Object.values(pageSigs).reduce((s, a) => s + (a?.length ?? 0), 0);
  const currentSigs  = pageSigs[page] ?? [];

  if (!file) {
    return (
      <DropZone onFiles={handleFiles} accept=".pdf,application/pdf" multiple={false}
        label="Drop a PDF to sign" sublabel="Your file never leaves the browser" />
    );
  }

  return (
    <div className="space-y-4">
      <PDFFileBar file={file} onClear={reset} />

      {status === 'loading' && <ProgressBar progress={0} label="Loading PDF…" />}
      {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded">{error}</p>}

      {pdf && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

          {/* ── Left: PDF page viewer ── */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              {/* Page nav */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Page {page} / {pageCount}
                  {currentSigs.length > 0 && (
                    <span className="ml-2 text-xs text-brand-500 font-mono">
                      {currentSigs.length} signature{currentSigs.length > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1}
                    onClick={() => { setPage(p => p - 1); setSelectedId(null); }}>
                    <CaretLeftIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" disabled={page >= pageCount}
                    onClick={() => { setPage(p => p + 1); setSelectedId(null); }}>
                    <CaretRightIcon className="size-4" />
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Drag signatures to reposition · Handles to resize · Click to select
              </p>

              {/* PDF + Konva overlay */}
              <div className="relative overflow-hidden rounded border border-border bg-gray-100 dark:bg-gray-900">
                <canvas ref={canvasRef} className="block w-full" />
                <div className="absolute inset-0" style={{ width: dims.w, height: dims.h }}>
                  <Stage width={dims.w} height={dims.h}
                    onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
                    onTouchStart={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
                  >
                    <Layer>
                      {currentSigs.map(sig => (
                        <PlacedSig key={sig.id} sig={sig}
                          selected={selectedId === sig.id}
                          onSelect={() => setSelectedId(sig.id)}
                          onChange={u => updatePageSigs(d => {
                            const idx = (d[page] ?? []).findIndex(s => s.id === sig.id);
                            if (idx >= 0) Object.assign(d[page][idx], u);
                          })}
                        />
                      ))}
                    </Layer>
                  </Stage>
                </div>
              </div>

              {selectedId && (
                <Button variant="outline" size="sm"
                  className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => {
                    updatePageSigs(d => { if (d[page]) d[page] = d[page].filter(s => s.id !== selectedId); });
                    setSelectedId(null);
                  }}>
                  <TrashIcon className="size-4" /> Remove Selected
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ── Right: Signature panel ── */}
          <div className="space-y-3">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-4">
                <p className="text-sm font-semibold text-foreground">Create Signature</p>

                <Tabs value={sigTab} onValueChange={setSigTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="draw"   className="flex-1">Draw</TabsTrigger>
                    <TabsTrigger value="type"   className="flex-1">Type</TabsTrigger>
                    <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
                  </TabsList>

                  <TabsContent value="draw" className="pt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="flex items-center justify-between">
                        <span>Stroke size</span>
                        <span className="font-mono text-muted-foreground">{strokeSize}px</span>
                      </Label>
                      <Slider min={1} max={8} step={1} value={[strokeSize]}
                        onValueChange={v => setStrokeSize(Array.isArray(v) ? v[0] : v)} />
                    </div>
                    <DrawPad strokeSize={strokeSize} onReady={setDrawUrl} />
                  </TabsContent>

                  <TabsContent value="type" className="pt-3 space-y-3">
                    <Input placeholder="Your name" value={typedName}
                      onChange={e => setTypedName(e.target.value)} />
                    {typedName.trim() && (
                      <div className="rounded border border-border bg-white px-4 py-3">
                        <p className="text-[#1e3a5f] select-none"
                          style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '2rem', fontFamily: 'Georgia, serif' }}>
                          {typedName}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="upload" className="pt-3 space-y-3">
                    <input type="file" accept="image/*"
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border file:text-sm file:bg-secondary file:text-foreground hover:file:bg-muted cursor-pointer"
                      onChange={async e => { const f = e.target.files?.[0]; if (f) setUploadUrl(await fileToDataUrl(f)); }} />
                    {uploadUrl && <img src={uploadUrl} alt="sig" className="max-h-24 rounded border border-border bg-white object-contain" />}
                  </TabsContent>
                </Tabs>

                <Button className="w-full" onClick={placeSig} disabled={!activeSigUrl()}>
                  <PlusIcon className="size-4" />
                  Place on Page {page}
                </Button>
              </CardContent>
            </Card>

            {/* Summary + export */}
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="text-sm">
                  <p className="font-medium text-foreground">
                    {pageSigCount === 0 ? 'No signatures placed yet' : `${pageSigCount} signature${pageSigCount > 1 ? 's' : ''} placed`}
                  </p>
                  {pageSigCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.entries(pageSigs)
                        .filter(([, sigs]) => sigs?.length > 0)
                        .map(([p, sigs]) => `Page ${p}: ${sigs.length}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>

                {status === 'processing' && <ProgressBar progress={progress} label="Embedding signatures…" />}

                <Button className="w-full" onClick={exportPDF}
                  disabled={pageSigCount === 0 || status === 'processing'}>
                  {status === 'processing' ? 'Exporting…' : 'Export Signed PDF'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
