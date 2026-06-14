import { useState, useEffect, useRef, useCallback } from 'react';
import { useImmer } from 'use-immer';
import { castDraft } from 'immer';
import { Stage, Layer, Line, Text as KonvaText, Image as KonvaImage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { useToolVisit } from '@/stores/toolVisit';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { renderPageToCanvas, stageToDataUrl, embedAnnotationOnPage } from '@/lib/pdf/pdfAnnotate';
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

type LineShape  = { id: string; type: 'line';  points: number[]; color: string; width: number };
type TextShape  = { id: string; type: 'text';  x: number; y: number; text: string; color: string; fontSize: number };
type ImageShape = { id: string; type: 'image'; x: number; y: number; width: number; height: number; src: string; imgEl: HTMLImageElement };
type Shape = LineShape | TextShape | ImageShape;
type Tool  = 'select' | 'pen' | 'text' | 'image';

const PEN_SIZES = [2, 5, 10] as const;

// ── Draggable text node ───────────────────────────────────────────────────────

function DraggableText({ shape, selected, onSelect, onChange }: {
  shape: TextShape; selected: boolean;
  onSelect: () => void; onChange: (u: Partial<TextShape>) => void;
}) {
  const nodeRef = useRef<Konva.Text>(null);
  const trRef   = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <KonvaText
        ref={nodeRef} draggable
        x={shape.x} y={shape.y}
        text={shape.text} fontSize={shape.fontSize}
        fill={shape.color} fontFamily="sans-serif"
        onClick={onSelect} onTap={onSelect}
        onDragEnd={e => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const n = nodeRef.current!;
          onChange({ x: n.x(), y: n.y(), fontSize: Math.max(10, shape.fontSize * n.scaleY()) });
          n.scaleX(1); n.scaleY(1);
        }}
      />
      {selected && <Transformer ref={trRef} enabledAnchors={['top-left','top-right','bottom-left','bottom-right']} keepRatio={false} boundBoxFunc={(o, n) => n.width < 20 ? o : n} />}
    </>
  );
}

// ── Draggable image node ──────────────────────────────────────────────────────

function DraggableImage({ shape, selected, onSelect, onChange }: {
  shape: ImageShape; selected: boolean;
  onSelect: () => void; onChange: (u: Partial<ImageShape>) => void;
}) {
  const nodeRef = useRef<Konva.Image>(null);
  const trRef   = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <KonvaImage
        ref={nodeRef} draggable
        image={shape.imgEl as HTMLImageElement}
        x={shape.x} y={shape.y} width={shape.width} height={shape.height}
        shadowColor="rgba(0,0,0,0.25)" shadowBlur={selected ? 8 : 0}
        onClick={onSelect} onTap={onSelect}
        onDragEnd={e => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const n = nodeRef.current!;
          onChange({ x: n.x(), y: n.y(), width: Math.max(20, n.width() * n.scaleX()), height: Math.max(20, n.height() * n.scaleY()) });
          n.scaleX(1); n.scaleY(1);
        }}
      />
      {selected && <Transformer ref={trRef} keepRatio={false} boundBoxFunc={(o, n) => n.width < 20 || n.height < 20 ? o : n} />}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PDFAnnotateTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/annotate');

  const [file, setFile]   = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [pdf,  setPdf]    = useState<PDFDocumentProxy | null>(null);
  const [page, setPage]   = useState(1);
  const [total, setTotal] = useState(0);
  const [scale, setScale] = useState(1);
  const [sz, setSz]       = useState({ w: 0, h: 0 });

  const [tool,     setTool]     = useState<Tool>('pen');
  const [color,    setColor]    = useState('#e11d48');
  const [penSize,  setPenSize]  = useState(3);
  const [fontSize, setFontSize] = useState(20);
  const [shapes, updShapes]     = useImmer<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [op, updateOp]          = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  // Inline text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number; stageX: number; stageY: number } | null>(null);
  const [textVal, setTextVal]     = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stageRef   = useRef<import('konva/lib/Stage').Stage | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const isDrawing  = useRef(false);

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
      setScale(r.scale);
      setSz({ w: canvasRef.current!.width, h: canvasRef.current!.height });
    })();
    return () => { cancel = true; };
  }, [pdf, page]);

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
      setPdf(doc); setTotal(doc.numPages); setPage(1);
      updShapes(() => []); setSelectedId(null);
      setSessionFiles([f]);
      updateOp(d => { d.status = 'idle'; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Failed'; });
    }
  };

  const reset = () => {
    shapes.forEach(s => { if (s.type === 'image') URL.revokeObjectURL(s.src); });
    setFile(null); setPdf(null); setPage(1); setTotal(0);
    updShapes(() => []); setSelectedId(null);
    updateOp(() => ({ ...IDLE_OP })); clearSession();
  };

  const commitText = useCallback(() => {
    if (!textInput || !textVal.trim()) { setTextInput(null); setTextVal(''); return; }
    updShapes(d => { d.push({ id: generateId(), type: 'text', x: textInput.stageX, y: textInput.stageY, text: textVal.trim(), color, fontSize }); });
    setTextInput(null); setTextVal('');
    setTool('select');
  }, [textInput, textVal, color, fontSize]);

  const onStageDown = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const pos   = stage?.getPointerPosition();
    if (!pos) return;

    if (tool === 'select') {
      if (e.target === stage) setSelectedId(null);
      return;
    }

    if (tool === 'pen') {
      isDrawing.current = true;
      updShapes(d => { d.push({ id: generateId(), type: 'line', points: [pos.x, pos.y], color, width: penSize }); });
      return;
    }

    if (tool === 'text') {
      // Show inline textarea at click position
      const container = stage?.container();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setTextVal('');
      setTextInput({ x: rect.left + pos.x, y: rect.top + pos.y, stageX: pos.x, stageY: pos.y });
      return;
    }

    if (tool === 'image') { imageInput.current?.click(); }
  }, [tool, color, penSize]);

  const onStageMove = useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing.current || tool !== 'pen') return;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    updShapes(d => {
      const last = d[d.length - 1];
      if (last?.type === 'line') last.points = [...last.points, pos.x, pos.y];
    });
  }, [tool]);

  const onStageUp = useCallback(() => { isDrawing.current = false; }, []);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const src = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      const maxW = sz.w * 0.4;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const w = Math.min(maxW, img.naturalWidth), h = w * ratio;
      updShapes(d => { d.push({ id: generateId(), type: 'image', x: (sz.w - w) / 2, y: (sz.h - h) / 2, width: w, height: h, src, imgEl: castDraft(img) }); });
      setSelectedId(null); setTool('select');
    };
    img.src = src; e.target.value = '';
  };

  // Revoke image URLs on page change
  useEffect(() => () => { shapes.forEach(s => { if (s.type === 'image') URL.revokeObjectURL(s.src); }); }, [page]);

  const deleteSelected = () => {
    const s = shapes.find(s => s.id === selectedId);
    if (s?.type === 'image') URL.revokeObjectURL(s.src);
    updShapes(d => d.filter(s => s.id !== selectedId));
    setSelectedId(null);
  };

  const clearAll = () => {
    shapes.forEach(s => { if (s.type === 'image') URL.revokeObjectURL(s.src); });
    updShapes(() => []); setSelectedId(null);
  };

  const exportPDF = async () => {
    if (!file || !stageRef.current) return;
    updateOp(d => { d.status = 'processing'; d.progress = 10; d.error = ''; d.output = []; });
    try {
      const konvaCanvas = stageRef.current.toCanvas({ pixelRatio: 1 / scale });
      const dataUrl = stageToDataUrl(konvaCanvas);
      updateOp(d => { d.progress = 50; });
      const blob = await embedAnnotationOnPage(file.buffer, page - 1, dataUrl, scale);
      updateOp(d => { d.status = 'done'; d.progress = 100; d.output = [{ name: `${stripExtension(file.name)}_annotated_p${page}.pdf`, blob, size: blob.size }]; });
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Export failed'; });
    }
  };

  const cursor = tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : 'default';

  return (
    <div className="space-y-4">
      <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />

      {/* Inline text input — floats over the canvas */}
      {textInput && (
        <textarea
          ref={textRef}
          value={textVal}
          onChange={e => setTextVal(e.target.value)}
          onBlur={commitText}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') { setTextInput(null); setTextVal(''); } }}
          style={{
            position: 'fixed', left: textInput.x, top: textInput.y,
            fontSize: fontSize, color, fontFamily: 'sans-serif',
            background: 'rgba(255,255,255,0.9)', border: '1px dashed #10b981',
            padding: '2px 6px', minWidth: 120, zIndex: 9999,
            outline: 'none', resize: 'none', overflow: 'hidden',
          }}
          rows={2}
          placeholder="Type here, Enter to place…"
        />
      )}

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
                  { key: 'image',  icon: <ImageIcon className="size-4" />,        label: 'Image' },
                ] as const).map(({ key, icon, label }) => (
                  <Button key={key} variant="outline" size="sm" onClick={() => { setTool(key); setSelectedId(null); }}
                    className={cn('gap-1.5', tool === key ? 'border-brand-500 bg-brand-500/10 text-brand-500' : 'text-muted-foreground')}>
                    {icon}{label}
                  </Button>
                ))}
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
                <Button variant="ghost" size="icon" className="size-8" onClick={() => { updShapes(() => []); setPage(p => p - 1); }} disabled={page <= 1}>
                  <CaretLeftIcon className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} / {total}</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => { updShapes(() => []); setPage(p => p + 1); }} disabled={page >= total}>
                  <CaretRightIcon className="size-4" />
                </Button>
              </div>
            )}

            <div className="relative rounded-lg overflow-hidden border border-border bg-gray-100 dark:bg-gray-900"
              style={{ display: 'inline-block', width: sz.w || '100%' }}>
              <canvas ref={canvasRef} className="block" />
              {sz.w > 0 && sz.h > 0 && (
                <div className="absolute inset-0" style={{ cursor }}>
                  <Stage ref={stageRef} width={sz.w} height={sz.h}
                    onMouseDown={onStageDown} onMouseMove={onStageMove} onMouseUp={onStageUp}
                    onTouchStart={onStageDown} onTouchMove={onStageMove} onTouchEnd={onStageUp}>
                    <Layer>
                      {shapes.map(s => {
                        if (s.type === 'line') return (
                          <Line key={s.id} points={s.points} stroke={s.color} strokeWidth={s.width}
                            tension={0.5} lineCap="round" lineJoin="round"
                            onClick={() => { if (tool === 'select') setSelectedId(s.id); }}
                          />
                        );
                        if (s.type === 'text') return (
                          <DraggableText key={s.id} shape={s}
                            selected={selectedId === s.id && tool === 'select'}
                            onSelect={() => tool === 'select' && setSelectedId(s.id)}
                            onChange={u => updShapes(d => { const idx = d.findIndex(x => x.id === s.id); if (idx >= 0) Object.assign(d[idx], u); })}
                          />
                        );
                        if (s.type === 'image') return (
                          <DraggableImage key={s.id} shape={s}
                            selected={selectedId === s.id && tool === 'select'}
                            onSelect={() => tool === 'select' && setSelectedId(s.id)}
                            onChange={u => updShapes(d => { const idx = d.findIndex(x => x.id === s.id); if (idx >= 0) Object.assign(d[idx], u); })}
                          />
                        );
                        return null;
                      })}
                    </Layer>
                  </Stage>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {status === 'processing' && <ProgressBar progress={progress} label="Exporting…" />}
            <Button onClick={exportPDF} disabled={status === 'processing' || shapes.length === 0} className="w-full gap-2">
              <FloppyDiskIcon className="size-4" />
              {status === 'processing' ? 'Exporting…' : 'Save Annotated PDF'}
            </Button>
          </div>
        </>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
