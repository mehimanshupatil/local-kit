import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number; // 1-indexed
  width?: number;
  rotation?: number; // visual rotation overlay (0/90/180/270)
  className?: string;
}

export default function PDFPageThumbnail({ pdf, pageNumber, width = 100, rotation = 0, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [aspect, setAspect] = useState(1.414); // A4 default

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const vp = page.getViewport({ scale: 1 });
        const scale = width / vp.width;
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        setAspect(scaled.height / scaled.width);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setLoaded(true);
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [pdf, pageNumber, width]);

  return (
    <div
      className={`relative overflow-hidden rounded shadow-sm border border-gray-200 dark:border-gray-700 bg-white ${className}`}
      style={{ width, height: Math.round(width * aspect) }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.25s ease' }} />
      {!loaded && (
        <div className="absolute inset-0 bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-300 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      )}
    </div>
  );
}
