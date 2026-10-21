import { useState, useEffect, useRef, useCallback } from 'react';
import { useHotkeys, useElementSize, useMergedRef } from '@mantine/hooks';
import { useImmer } from 'use-immer';
import { castDraft, type Draft } from 'immer';
import { Stage, Layer, Line, Rect, Text as KonvaText, Image as KonvaImage, Transformer } from 'react-konva';
import Konva from 'konva';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { useToolVisit } from '@/stores/toolVisit';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { renderPageToCanvas, stageToDataUrl, embedAnnotationOnPage, annotationPxPerPoint } from '@/lib/pdf/pdfAnnotate';
import { stripExtension, generateId } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import PDFFileBar from './PDFFileBar';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  ArrowUpLeftIcon, PencilSimpleIcon, TextTIcon, ImageIcon,
  TrashIcon, CaretLeftIcon, CaretRightIcon, FloppyDiskIcon,
} from '@phosphor-icons/react';

// ── Types ─────────────────────────────────────────────────────────────────────

type LineShape  = { id: string; type: 'line';  x: number; y: number; points: number[]; color: string; width: number };
type TextShape  = { id: string; type: 'text';  x: number; y: number; text: string; color: string; fontSize: number };
type ImageShape = { id: string; type: 'image'; x: number; y: number; width: number; height: number; src: string; imgEl: HTMLImageElement };
type Shape = LineShape | TextShape | ImageShape;
type Tool  = 'select' | 'pen' | 'text';

const PEN_SIZES = [2, 5, 10] as const;
const NO_SHAPES: Shape[] = []; // stable reference so effects keyed on `shapes` don't refire on empty pages

// Shared between the live stage and the offscreen export render so both look the same
const LINE_STYLE = { tension: 0.5, lineCap: 'round', lineJoin: 'round' } as const;
const TEXT_STYLE = { fontFamily: 'sans-serif' } as const;
const BRAND = '#10b981';

/** Draw one page's shapes on a throwaway Konva stage → transparent PNG at print-quality resolution */
function renderShapesToDataUrl(shapes: Shape[], w: number, h: number, scale: number): string {
  const stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h });
  const layer = new Konva.Layer();
  stage.add(layer);
  for (const s of shapes) {
    if (s.type === 'line') layer.add(new Konva.Line({ x: s.x, y: s.y, points: s.points, stroke: s.color, strokeWidth: s.width, ...LINE_STYLE }));
    else if (s.type === 'text') layer.add(new Konva.Text({ x: s.x, y: s.y, text: s.text, fontSize: s.fontSize, fill: s.color, ...TEXT_STYLE }));
    else layer.add(new Konva.Image({ image: s.imgEl, x: s.x, y: s.y, width: s.width, height: s.height }));
  }
  // Stage is in display px (scale px per point); render at annotationPxPerPoint px per point instead
  const pxPerPoint = annotationPxPerPoint({ width: w / scale, height: h / scale });
  const dataUrl = stageToDataUrl(stage.toCanvas({ pixelRatio: pxPerPoint / scale }));
  stage.destroy();
  return dataUrl;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PDFAnnotateTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/annotate');

  const [file, setFile]   = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [pdf,  setPdf]    = useState<PDFDocumentProxy | null>(null);
  const [page, setPage]   = useState(1);
  const [total, setTotal] = useState(0);
  const [sz, setSz]       = useState({ w: 0, h: 0 });
  // Display size + scale of each page as rendered — needed to export pages that aren't on screen
  const pageSizes = useRef<Record<number, { w: number; h: number; scale: number }>>({});

  const [tool,     setTool]     = useState<Tool>('pen');
  const [color,    setColor]    = useState('#e11d48');
  const [penSize,  setPenSize]  = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [pageShapes, updPageShapes] = useImmer<Record<number, Shape[]>>({});
  const shapes = pageShapes[page] ?? NO_SHAPES;
  const annotatedPages = Object.keys(pageShapes).map(Number).filter(p => pageShapes[p].length > 0).sort((a, b) => a - b);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId]       = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Bounding boxes of every shape, shown as dashed outlines in Select mode so it's clear what can be picked
  const [outlines, setOutlines]     = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([]);
  const [op, updateOp]          = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  // Inline text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal]     = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  // The page canvas shrinks to fit narrow screens; the drawing layer is scaled by the same factor.
  // Shape coordinates stay in canvas px (what export expects) — only the display is scaled.
  const { ref: pageSizeRef, width: pageShownW } = useElementSize<HTMLCanvasElement>();
  const pageCanvasRef = useMergedRef(canvasRef, pageSizeRef);
  const fit = pageShownW > 0 && sz.w > 0 ? pageShownW / sz.w : 1;
  const imageInput = useRef<HTMLInputElement>(null);
  const isDrawing  = useRef(false);
  const layerRef   = useRef<Konva.Layer>(null);
  const trRef      = useRef<Konva.Transformer>(null);

  // Edit the current page's shapes
  const updShapes = useCallback((recipe: (d: Draft<Shape[]>) => void) => {
    updPageShapes(d => { recipe(d[page] ??= []); });
  }, [page]);

  const revokeAllImages = (all: Record<number, Shape[]>) => {
    Object.values(all).flat().forEach(s => { if (s.type === 'image') URL.revokeObjectURL(s.src); });
  };
  const pageShapesRef = useRef(pageShapes);
  pageShapesRef.current = pageShapes;
  useEffect(() => () => revokeAllImages(pageShapesRef.current), []);

  // Session restore
  useEffect(() => {
    if (sessionFiles.length > 0 && !file) try { handleFiles([sessionFiles[0]]); } catch {}
  }, []);

  // Re-render page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancel = false;
    (async () => {
      const r = await renderPageToCanvas(pdf, page, canvasRef.current!);
      if (cancel) return;
      const size = { w: canvasRef.current!.width, h: canvasRef.current!.height };
      pageSizes.current[page] = { ...size, scale: r.scale };
      setSz(size);
    })();
    return () => { cancel = true; };
  }, [pdf, page]);

  const findNode = (id: string) => layerRef.current?.findOne((n: Konva.Node) => n.hasName('annotation') && n.id() === id);

  // Attach the transformer to the selected shape
  useEffect(() => {
    const node = selectedId && tool === 'select' ? findNode(selectedId) : undefined;
    trRef.current?.nodes(node ? [node] : []);
  }, [selectedId, tool, shapes]);

  useEffect(() => {
    const layer = layerRef.current;
    if (tool !== 'select' || !layer) { setOutlines(prev => prev.length ? [] : prev); return; }
    setOutlines(layer.find('.annotation').map(n => ({ id: n.id(), ...n.getClientRect({ relativeTo: layer, skipShadow: true }) })));
  }, [tool, shapes, sz]);

  // Focus text input when it appears
  useEffect(() => {
    if (textInput) textRef.current?.focus();
  }, [textInput]);

  const handleFiles = async ([f]: File[]) => {
    updateOp(d => { d.status = 'loading'; d.error = ''; });
    try {
      const buf = await f.arrayBuffer();
      const doc = await loadPDFDocument(buf.slice(0));
      setFile({ name: f.name, size: f.size, buffer: buf });
      revokeAllImages(pageShapes); pageSizes.current = {};
      setPdf(doc); setTotal(doc.numPages); setPage(1);
      updPageShapes(() => ({})); setSelectedId(null);
      setSessionFiles([f]);
      updateOp(d => { d.status = 'idle'; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Failed'; });
    }
  };

  const reset = () => {
    revokeAllImages(pageShapes); pageSizes.current = {};
    setFile(null); setPdf(null); setPage(1); setTotal(0);
    updPageShapes(() => ({})); setSelectedId(null);
    updateOp(() => ({ ...IDLE_OP })); clearSession();
  };

  const commitText = useCallback(() => {
    if (!textInput || !textVal.trim()) { setTextInput(null); setTextVal(''); return; }
    updShapes(d => { d.push({ id: generateId(), type: 'text', x: textInput.x, y: textInput.y, text: textVal.trim(), color, fontSize }); });
    setTextInput(null); setTextVal('');
    setTool('select');
  }, [textInput, textVal, color, fontSize, updShapes]);

  const onStageDown = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const pos   = stage?.getRelativePointerPosition();
    if (!pos) return;

    if (tool === 'select') {
      // Transformer handles are neither a shape nor the stage — leave the selection alone for those
      if (e.target.hasName('annotation')) setSelectedId(e.target.id());
      else if (e.target === stage) setSelectedId(null);
      return;
    }

    if (tool === 'pen') {
      isDrawing.current = true;
      updShapes(d => { d.push({ id: generateId(), type: 'line', x: 0, y: 0, points: [pos.x, pos.y], color, width: penSize }); });
    }
  }, [tool, color, penSize, updShapes]);

  // Text placement runs on click, not mousedown: the browser's default mousedown focus
  // handling would otherwise blur the freshly focused textarea and commit it empty.
  const onStageClick = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (tool === 'text' && pos) { setTextVal(''); setTextInput(pos); }
  }, [tool]);

  /** Centre of the part of the page currently on screen, in stage coordinates */
  const visiblePageCentre = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: sz.w / 2, y: sz.h / 2 };
    // rect is in screen px; divide by fit to get canvas px
    const top = Math.max(0, -rect.top / fit), bottom = Math.min(sz.h, (window.innerHeight - rect.top) / fit);
    return { x: sz.w / 2, y: bottom > top ? (top + bottom) / 2 : sz.h / 2 };
  };

  const onStageMove = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing.current || tool !== 'pen') return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    updShapes(d => {
      const last = d[d.length - 1];
      if (last?.type === 'line') last.points = [...last.points, pos.x, pos.y];
    });
  }, [tool, updShapes]);

  const onStageUp = useCallback(() => { isDrawing.current = false; }, []);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const src = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      const maxW = sz.w * 0.4;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = Math.min(maxW, img.naturalWidth), h = w * ratio;
      // Drop it where the user can see it, kept inside the page
      const at = visiblePageCentre();
      const x = Math.min(Math.max(0, at.x - w / 2), sz.w - w);
      const y = Math.min(Math.max(0, at.y - h / 2), sz.h - h);
      const id = generateId();
      updShapes(d => { d.push({ id, type: 'image', x, y, width: w, height: h, src, imgEl: castDraft(img) }); });
      setTool('select'); setSelectedId(id);
    };
    img.src = src; e.target.value = '';
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const s = shapes.find(s => s.id === selectedId);
    if (s?.type === 'image') URL.revokeObjectURL(s.src);
    updShapes(d => { const i = d.findIndex(s => s.id === selectedId); if (i >= 0) d.splice(i, 1); });
    setSelectedId(null);
  };

  useHotkeys([['Delete', deleteSelected], ['Backspace', deleteSelected], ['Escape', () => setSelectedId(null)]]);

  const updateShape = (id: string, u: Partial<Shape>) =>
    updShapes(d => { const i = d.findIndex(x => x.id === id); if (i >= 0) Object.assign(d[i], u); });

  const onTransformEnd = (s: Shape) => (e: KonvaEventObject<Event>) => {
    const n = e.target;
    if (s.type === 'text') updateShape(s.id, { x: n.x(), y: n.y(), fontSize: Math.max(10, s.fontSize * n.scaleY()) });
    if (s.type === 'image') updateShape(s.id, { x: n.x(), y: n.y(), width: Math.max(20, n.width() * n.scaleX()), height: Math.max(20, n.height() * n.scaleY()) });
    n.scaleX(1); n.scaleY(1);
  };

  const clearAll = () => {
    shapes.forEach(s => { if (s.type === 'image') URL.revokeObjectURL(s.src); });
    updShapes(d => { d.length = 0; }); setSelectedId(null);
  };

  const exportPDF = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; d.output = []; });
    try {
      let buf = file.buffer.slice(0);
      for (let i = 0; i < annotatedPages.length; i++) {
        const p = annotatedPages[i];
        const { w, h, scale } = pageSizes.current[p];
        const dataUrl = renderShapesToDataUrl(pageShapes[p], w, h, scale);
        const blob = await embedAnnotationOnPage(buf, p - 1, dataUrl, scale);
        buf = await blob.arrayBuffer();
        updateOp(d => { d.progress = Math.round(((i + 1) / annotatedPages.length) * 95); });
      }
      const final = new Blob([buf], { type: 'application/pdf' });
      updateOp(d => { d.status = 'done'; d.progress = 100; d.output = [{ name: `${stripExtension(file.name)}_annotated.pdf`, blob: final, size: final.size }]; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Export failed'; });
    }
  };

  const isSelect = tool === 'select';
  const cursor = tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : hoverId ? 'move' : 'default';
  const selectedType = shapes.find(s => s.id === selectedId)?.type;

  // Props every shape node shares: identity for selection, Select-mode dragging and hover feedback
  const shapeProps = (s: Shape) => ({
    id: s.id, name: 'annotation', draggable: isSelect,
    onMouseEnter: () => isSelect && setHoverId(s.id),
    onMouseLeave: () => setHoverId(null),
    onDragStart: () => { setDraggingId(s.id); setSelectedId(s.id); },
    onDragEnd: (e: KonvaEventObject<DragEvent>) => { setDraggingId(null); updateShape(s.id, { x: e.target.x(), y: e.target.y() }); },
  });

  return (
    <div className="space-y-4">
      <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />

      {!file ? (
        <DropZone onFiles={handleFiles} accept=".pdf,application/pdf" multiple={false}
          label="Drop a PDF file" sublabel="Draw, add images and text on any page" />
      ) : (
        <PDFFileBar file={file} total={total} onClear={reset} />
      )}

      {status === 'loading' && <ProgressBar progress={0} label="Loading PDF…" />}
      {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded">{error}</p>}

      {file && status !== 'loading' && (
        <>
          {/* Toolbar */}
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Tools */}
              <div className="flex gap-1">
                {([
                  { key: 'select', icon: <ArrowUpLeftIcon className="size-4" />, label: 'Select' },
                  { key: 'pen',    icon: <PencilSimpleIcon className="size-4" />, label: 'Pen' },
                  { key: 'text',   icon: <TextTIcon className="size-4" />,        label: 'Text' },
                ] as const).map(({ key, icon, label }) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => { setTool(key); setSelectedId(null); }}
                    className={cn('gap-1.5', tool === key ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'text-muted-foreground')}>
                    {icon}{label}
                  </Button>
                ))}
                {/* An action, not a mode: opens the picker straight away */}
                <Button variant="outline" size="sm" onClick={() => imageInput.current?.click()} className="gap-1.5 text-muted-foreground">
                  <ImageIcon className="size-4" />Image
                </Button>
              </div>

              <div className="w-px h-6 bg-border" />

              {/* Color */}
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0 text-muted-foreground">Color</Label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-transparent" />
              </div>

              <div className="w-px h-6 bg-border" />

              {/* Pen size (only relevant for pen) */}
              {tool === 'pen' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">Size</span>
                  {PEN_SIZES.map(s => (
                    <button key={s} onClick={() => setPenSize(s)}
                      className={cn('flex items-center justify-center w-7 h-7 rounded border transition-all',
                        penSize === s ? 'border-brand-500 bg-brand-500/10' : 'border-border bg-secondary hover:bg-secondary/80')}>
                      <span className="rounded-full bg-foreground" style={{ width: s + 2, height: s + 2 }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Font size (only relevant for text) */}
              {tool === 'text' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">Size</span>
                  {[14, 20, 28, 40].map(s => (
                    <button key={s} onClick={() => setFontSize(s)}
                      className={cn('px-2 h-7 text-xs rounded border transition-all',
                        fontSize === s ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'border-border bg-secondary text-muted-foreground')}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                {selectedId && (
                  <Button variant="outline" size="sm" onClick={deleteSelected}
                    className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10">
                    <TrashIcon className="size-4" /> Delete
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={clearAll} disabled={shapes.length === 0}
                  className="gap-1.5 text-muted-foreground">
                  <TrashIcon className="size-4" /> Clear All
                </Button>
              </div>
            </div>
          </Card>

          {/* Page nav + canvas */}
          <div className="space-y-2">
            {total > 1 && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="ghost" size="icon" className="size-8" aria-label="Previous page" onClick={() => { setSelectedId(null); setPage(p => p - 1); }} disabled={page <= 1}>
                  <CaretLeftIcon className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} / {total}
                  {annotatedPages.length > 0 && <> · {annotatedPages.length} annotated</>}
                </span>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Next page" onClick={() => { setSelectedId(null); setPage(p => p + 1); }} disabled={page >= total}>
                  <CaretRightIcon className="size-4" />
                </Button>
              </div>
            )}

            <div className="relative rounded-lg overflow-hidden border border-border bg-gray-100 dark:bg-gray-900 max-w-full"
              style={{ display: 'inline-block', width: sz.w || '100%' }}>
              <canvas ref={pageCanvasRef} className="block w-full h-auto" />
              {sz.w > 0 && sz.h > 0 && (
                <div className="absolute inset-0" style={{ cursor }}>
                  <Stage width={sz.w * fit} height={sz.h * fit} scaleX={fit} scaleY={fit}
                    onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp}
                    onTouchStart={onStageDown} onTouchMove={onStageMove} onTouchEnd={onStageUp}
                    onClick={onStageClick} onTap={onStageClick}>
                    <Layer listening={false}>
                      {outlines.filter(o => o.id !== selectedId && o.id !== draggingId).map(o => (
                        <Rect key={o.id} x={o.x - 4} y={o.y - 4} width={o.width + 8} height={o.height + 8}
                          stroke={BRAND} strokeWidth={1} dash={o.id === hoverId ? undefined : [4, 4]}
                          opacity={o.id === hoverId ? 1 : 0.5} cornerRadius={2} />
                      ))}
                    </Layer>
                    <Layer ref={layerRef}>
                      {shapes.map(s => {
                        if (s.type === 'line') return (
                          <Line key={s.id} {...shapeProps(s)} x={s.x} y={s.y} points={s.points}
                            stroke={s.color} strokeWidth={s.width} hitStrokeWidth={Math.max(12, s.width)} {...LINE_STYLE} />
                        );
                        if (s.type === 'text') return (
                          <KonvaText key={s.id} {...shapeProps(s)} x={s.x} y={s.y} text={s.text}
                            fontSize={s.fontSize} fill={s.color} {...TEXT_STYLE} onTransformEnd={onTransformEnd(s)} />
                        );
                        return (
                          <KonvaImage key={s.id} {...shapeProps(s)} image={s.imgEl as HTMLImageElement}
                            x={s.x} y={s.y} width={s.width} height={s.height} onTransformEnd={onTransformEnd(s)} />
                        );
                      })}
                      <Transformer ref={trRef} rotateEnabled={false}
                        resizeEnabled={selectedType !== 'line'}
                        enabledAnchors={selectedType === 'text' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
                        keepRatio={selectedType === 'text'}
                        borderStroke={BRAND} anchorStroke={BRAND} anchorCornerRadius={2} padding={4}
                        boundBoxFunc={(o, n) => n.width < 20 || n.height < 10 ? o : n} />
                    </Layer>
                  </Stage>
                </div>
              )}
              {/* Inline text input, positioned in page coordinates where the user clicked */}
              {textInput && (
                <textarea
                  ref={textRef}
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  onBlur={commitText}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') { setTextInput(null); setTextVal(''); } }}
                  style={{
                    position: 'absolute', left: textInput.x * fit - 7, top: textInput.y * fit - 3,
                    fontSize: fontSize * fit, color, fontFamily: 'sans-serif', lineHeight: 1,
                    background: 'rgba(255,255,255,0.9)', border: `1px dashed ${BRAND}`,
                    padding: '2px 6px', minWidth: 120, zIndex: 10,
                    outline: 'none', resize: 'none', overflow: 'hidden',
                  }}
                  rows={2}
                  placeholder="Type here, Enter to place…"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            {/* Below the canvas so toggling it never shifts the page under the pointer */}
            <p className={cn('text-xs text-muted-foreground', !(isSelect && shapes.length > 0) && 'invisible')}>
              Click an outlined item to select it · drag to move · corner handles resize text and images · Delete removes it
            </p>
            {status === 'processing' && <ProgressBar progress={progress} label="Exporting…" />}
            <Button onClick={exportPDF} disabled={status === 'processing' || annotatedPages.length === 0} className="w-full gap-2">
              <FloppyDiskIcon className="size-4" />
              {status === 'processing' ? 'Exporting…' : annotatedPages.length > 1 ? `Save Annotated PDF (${annotatedPages.length} pages)` : 'Save Annotated PDF'}
            </Button>
          </div>
        </>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
