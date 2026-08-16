import mammoth from 'mammoth';

export interface ConversionResult {
  html: string;
  warnings: string[];
}

export async function docxToHtml(file: File): Promise<ConversionResult> {
  const buffer = await file.arrayBuffer();
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return {
      html: result.value,
      warnings: result.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message),
    };
  } catch (e) {
    const isDoc = file.name.toLowerCase().endsWith('.doc');
    if (isDoc) {
      throw new Error(
        'This appears to be an old binary .doc file. Please open it in Microsoft Word or LibreOffice and save as .docx, then try again.'
      );
    }
    throw e;
  }
}

// Browsers refuse (or silently blank) canvases past a certain size. Chrome's
// practical single-dimension limit sits well below the theoretical 268M px^2
// area cap, so a tall document rendered whole at scale 2 can exceed it and come
// out blank. Rather than downscale (which blurs text), the document is split
// into chunks of top-level elements small enough to stay under that limit at
// full scale, rendered separately, then stitched across PDF pages.
const CONTENT_WIDTH = 794; // A4 at 96dpi
const PADDING = 72;
const SCALE = 2;
const MAX_CANVAS_DIMENSION = 14000;
const MAX_CANVAS_AREA = 100_000_000;

const baseContentStyle = [
  `width:${CONTENT_WIDTH}px`,
  'background:#fff',
  'font-family:Georgia,serif',
  'font-size:12pt',
  'line-height:1.6',
  'box-sizing:border-box',
  'color:#000',
];

function constrainImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach(img => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
  });
}

async function waitForImages(root: HTMLElement): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));
}

export async function htmlToPdfBlob(
  html: string,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  onProgress?.(10);

  // Measure top-level elements (off-screen) to decide chunk boundaries, without
  // yet paying the cost of rendering anything.
  const measure = document.createElement('div');
  measure.style.cssText = [
    'position:fixed', 'top:-99999px', 'left:-99999px',
    ...baseContentStyle,
    `padding:${PADDING}px`,
  ].join(';');
  measure.innerHTML = html;
  constrainImages(measure);
  document.body.appendChild(measure);
  await waitForImages(measure);

  const chunkMaxHeight = MAX_CANVAS_DIMENSION / SCALE;
  const chunks: Element[][] = [];
  let current: Element[] = [];
  let currentHeight = 0;
  for (const child of Array.from(measure.children)) {
    const h = child.getBoundingClientRect().height;
    if (current.length && currentHeight + h > chunkMaxHeight) {
      chunks.push(current);
      current = [];
      currentHeight = 0;
    }
    current.push(child);
    currentHeight += h;
  }
  if (current.length) chunks.push(current);

  document.body.removeChild(measure);
  onProgress?.(20);

  const { default: html2canvas } = await import('html2canvas');
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'px', format: 'a4', orientation: 'portrait' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  let stripPosition = 0;
  let pageIndex = 0;

  for (let i = 0; i < chunks.length; i++) {
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;

    const chunk = document.createElement('div');
    chunk.style.cssText = [
      'position:fixed', 'top:-99999px', 'left:-99999px',
      ...baseContentStyle,
      `padding:${isFirst ? PADDING : 0}px ${PADDING}px ${isLast ? PADDING : 0}px ${PADDING}px`,
    ].join(';');
    chunks[i].forEach(el => chunk.appendChild(el.cloneNode(true)));
    document.body.appendChild(chunk);

    // Safety net: a single oversized element (e.g. one very tall image) could
    // still exceed the limit on its own — fall back to downscaling just that chunk.
    const chunkHeight = chunk.scrollHeight;
    const scale = Math.min(
      SCALE,
      MAX_CANVAS_DIMENSION / chunkHeight,
      Math.sqrt(MAX_CANVAS_AREA / (CONTENT_WIDTH * chunkHeight)),
    );

    const canvas = await html2canvas(chunk, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    document.body.removeChild(chunk);

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgH = pdfW * (canvas.height / canvas.width);

    const chunkStart = stripPosition;
    const chunkEnd = stripPosition + imgH;
    const firstPage = Math.floor(chunkStart / pdfH);
    const lastPage = Math.max(firstPage, Math.ceil(chunkEnd / pdfH) - 1);

    for (let p = firstPage; p <= lastPage; p++) {
      if (p > pageIndex) {
        pdf.addPage();
        pageIndex = p;
      }
      pdf.addImage(imgData, 'JPEG', 0, chunkStart - p * pdfH, pdfW, imgH);
    }

    stripPosition = chunkEnd;
    onProgress?.(20 + Math.round(((i + 1) / chunks.length) * 70));
  }

  onProgress?.(100);
  return pdf.output('blob');
}
