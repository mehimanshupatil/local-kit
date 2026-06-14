import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import { useClipboard } from '@mantine/hooks';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { OcrPageResult, OcrWordResult } from '@/lib/ocr/ocr';

interface Props {
  file: File;
  pageData: OcrPageResult[];
}

const CONF_LOW = 50;
const PAGE_GAP = 12;
const BASELINE_RATIO = 0.8;

interface SelectionRect { x1: number; y1: number; x2: number; y2: number }

interface WordRef {
  pi: number;
  wi: number;
  word: OcrWordResult;
  /** canvas-space bbox */
  cx: number; cy: number; cw: number; ch: number;
}

async function renderAllPDFPages(file: File, totalPages: number): Promise<string[]> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.min.mjs';
  const buf = await file.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  return Promise.all(
    Array.from({ length: totalPages }, async (_, i) => {
      const pg = await pdf.getPage(i + 1);
      const vp = pg.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await pg.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      return canvas.toDataURL('image/png');
    })
  );
}

function usePageImages(file: File, pageCount: number) {
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>([]);
  const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  useEffect(() => {
    setImgs([]);
    let cancelled = false;
    (async () => {
      const srcs = isPDF
        ? await renderAllPDFPages(file, pageCount)
        : [URL.createObjectURL(file)];
      if (cancelled) { if (!isPDF) URL.revokeObjectURL(srcs[0]); return; }
      const elements = await Promise.all(srcs.map(src => new Promise<HTMLImageElement>(res => {
        const el = new window.Image(); el.onload = () => res(el); el.src = src;
      })));
      if (!cancelled) setImgs(elements);
      if (!isPDF) URL.revokeObjectURL(srcs[0]);
    })();
    return () => { cancelled = true; };
  }, [file, pageCount, isPDF]);
  return imgs;
}

function rectsOverlap(ax: number, ay: number, aw: number, ah: number,
                      bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export default function OCROverlay({ file, pageData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [showOverlay, setShowOverlay] = useState(true);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selRect, setSelRect] = useState<SelectionRect | null>(null);
  const isSelecting = useRef(false);
  const clipboard = useClipboard({ timeout: 2000 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const imgs = usePageImages(file, pageData.length);
  const firstDims = pageData[0]?.dims ?? { width: 1, height: 1 };

  const pageStops: number[] = [];
  let yAccum = 0;
  for (const pg of pageData) {
    pageStops.push(yAccum);
    yAccum += (pg.dims.height || firstDims.height) * (containerWidth / (pg.dims.width || 1)) + PAGE_GAP;
  }
  const totalStageHeight = Math.max(yAccum - PAGE_GAP, 100);

  // Flat list of all words with their canvas coords — rebuilt on containerWidth change
  const allWordRefs: WordRef[] = pageData.flatMap((pgData, pi) => {
    const pgScale = containerWidth / (pgData.dims.width || 1);
    const yOff = pageStops[pi];
    return pgData.words.map((word, wi) => ({
      pi, wi, word,
      cx: word.bbox.left * pgScale,
      cy: yOff + word.bbox.top * pgScale,
      cw: (word.bbox.right - word.bbox.left) * pgScale,
      ch: (word.bbox.bottom - word.bbox.top) * pgScale,
    }));
  });

  const getStagePos = (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    return stage?.getPointerPosition() ?? { x: 0, y: 0 };
  };

  const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!showOverlay) return;
    // Clear selection on plain click (no drag)
    const { x, y } = getStagePos(e);
    isSelecting.current = true;
    setSelRect({ x1: x, y1: y, x2: x, y2: y });
    setSelectedKeys(new Set());
  }, [showOverlay]);

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!isSelecting.current) return;
    const { x, y } = getStagePos(e);
    setSelRect(r => r ? { ...r, x2: x, y2: y } : null);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting.current || !selRect) return;
    isSelecting.current = false;

    const sx = Math.min(selRect.x1, selRect.x2);
    const sy = Math.min(selRect.y1, selRect.y2);
    const sw = Math.abs(selRect.x2 - selRect.x1);
    const sh = Math.abs(selRect.y2 - selRect.y1);

    if (sw < 4 && sh < 4) {
      // Tiny click — check if we clicked a single word
      const hit = allWordRefs.find(w => rectsOverlap(sx, sy, 1, 1, w.cx, w.cy, w.cw, w.ch));
      setSelectedKeys(hit ? new Set([`${hit.pi}-${hit.wi}`]) : new Set());
    } else {
      const keys = allWordRefs
        .filter(w => rectsOverlap(sx, sy, sw, sh, w.cx, w.cy, w.cw, w.ch))
        .map(w => `${w.pi}-${w.wi}`);
      setSelectedKeys(new Set(keys));
    }
    setSelRect(null);
  }, [selRect, allWordRefs]);

  // Build selected text in reading order
  const selectedText = pageData.flatMap((pgData, pi) =>
    pgData.words
      .filter((_, wi) => selectedKeys.has(`${pi}-${wi}`))
      .map(w => w.text)
  ).join(' ');

  const loaded = imgs.length === pageData.length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} className="size-4 accent-brand-600" />
            Show text overlay
          </label>
        </div>
        <div className="flex items-center gap-2">
          {selectedKeys.size > 0 && (
            <Button size="sm" variant="secondary" onClick={() => clipboard.copy(selectedText)}>
              {clipboard.copied
                ? <><Check className="size-3.5 text-green-500" /> Copied!</>
                : <><Copy className="size-3.5" /> Copy {selectedKeys.size} word{selectedKeys.size > 1 ? 's' : ''}</>
              }
            </Button>
          )}
          {pageData.length > 1 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{pageData.length} pages</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-auto border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900"
        style={{ width: '100%', maxHeight: 680, cursor: showOverlay ? 'crosshair' : 'default' }}
      >
        {containerWidth > 0 && (
          !loaded ? (
            <div className="flex items-center justify-center h-24 text-sm text-gray-400">
              {imgs.length === 0 ? 'Rendering pages…' : `Loading ${imgs.length} / ${pageData.length}…`}
            </div>
          ) : (
            <Stage
              width={containerWidth}
              height={totalStageHeight}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Layer 1 — background images */}
              <Layer listening={false}>
                {imgs.map((img, pi) => {
                  if (!img) return null;
                  const pgDims = pageData[pi]?.dims ?? firstDims;
                  const pgScale = containerWidth / (pgDims.width || 1);
                  return (
                    <KonvaImage key={pi} image={img} x={0} y={pageStops[pi]}
                      width={containerWidth} height={(pgDims.height || 1) * pgScale} />
                  );
                })}
              </Layer>

              {/* Layer 2 — word highlights + text */}
              {showOverlay && (
                <Layer>
                  {pageData.map((pgData, pi) => {
                    const pgScale = containerWidth / (pgData.dims.width || 1);
                    const yOff = pageStops[pi];
                    return pgData.words.map((word, wi) => {
                      const key = `${pi}-${wi}`;
                      const fontSize = (word.bbox.bottom - word.bbox.top) * pgScale;
                      const x = word.bbox.left * pgScale;
                      const y = yOff + word.baseline * pgScale - fontSize * BASELINE_RATIO;
                      const w = (word.bbox.right - word.bbox.left) * pgScale;
                      const h = (word.bbox.bottom - word.bbox.top) * pgScale;
                      const lowConf = word.conf < CONF_LOW;
                      const isSelected = selectedKeys.has(key);
                      const isHovered = hoveredKey === key;
                      const fontStyle = [word.italic ? 'italic' : '', word.bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal';

                      return (
                        <Group
                          key={key}
                          onMouseEnter={() => setHoveredKey(key)}
                          onMouseLeave={() => setHoveredKey(null)}
                        >
                          <Rect
                            x={x} y={yOff + word.bbox.top * pgScale} width={w} height={h}
                            fill={
                              isSelected ? 'rgba(234,179,8,0.35)'
                              : isHovered ? 'rgba(2,132,199,0.22)'
                              : lowConf ? 'rgba(239,68,68,0.12)'
                              : 'rgba(2,132,199,0.12)'
                            }
                            stroke={
                              isSelected ? 'rgba(234,179,8,0.8)'
                              : isHovered ? 'rgba(2,132,199,0.7)'
                              : lowConf ? 'rgba(239,68,68,0.5)'
                              : 'rgba(2,132,199,0.4)'
                            }
                            strokeWidth={isSelected || isHovered ? 1.5 : 1}
                            cornerRadius={2}
                            listening={false}
                          />
                          <Text
                            x={x} y={y} width={w}
                            text={word.text}
                            fontSize={fontSize}
                            fontFamily={word.fontFamily ?? 'sans-serif'}
                            fontStyle={fontStyle}
                            fill={
                              isSelected ? 'rgba(161,120,0,0.9)'
                              : lowConf ? 'rgba(239,68,68,0.75)'
                              : 'rgba(2,132,199,0.75)'
                            }
                            listening={false}
                          />
                        </Group>
                      );
                    });
                  })}
                </Layer>
              )}

              {/* Layer 3 — live drag-selection rectangle */}
              <Layer listening={false}>
                {selRect && (() => {
                  const sx = Math.min(selRect.x1, selRect.x2);
                  const sy = Math.min(selRect.y1, selRect.y2);
                  const sw = Math.abs(selRect.x2 - selRect.x1);
                  const sh = Math.abs(selRect.y2 - selRect.y1);
                  return (
                    <Rect x={sx} y={sy} width={sw} height={sh}
                      fill="rgba(234,179,8,0.1)"
                      stroke="rgba(234,179,8,0.8)"
                      strokeWidth={1.5}
                      dash={[6, 3]}
                    />
                  );
                })()}
              </Layer>
            </Stage>
          )
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-brand-200 dark:bg-brand-800 border border-brand-400" />
          High confidence
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-red-200 dark:bg-red-900 border border-red-400" />
          Low confidence (&lt;{CONF_LOW}%)
        </span>
        {showOverlay && (
          <span className="ml-auto">Drag to select · click word to select</span>
        )}
      </div>
    </div>
  );
}
