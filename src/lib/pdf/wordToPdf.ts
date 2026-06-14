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

export async function htmlToPdfBlob(
  html: string,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  onProgress?.(10);

  // Render HTML in an off-screen div
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed', 'top:-9999px', 'left:-9999px',
    'width:794px',   // A4 at 96dpi ≈ 794px
    'background:#fff',
    'font-family:Georgia,serif',
    'font-size:12pt',
    'line-height:1.6',
    'padding:72px',
    'box-sizing:border-box',
    'color:#000',
  ].join(';');
  container.innerHTML = html;
  document.body.appendChild(container);

  onProgress?.(30);

  const { default: html2canvas } = await import('html2canvas');
  const { jsPDF } = await import('jspdf');

  onProgress?.(50);

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  document.body.removeChild(container);
  onProgress?.(80);

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({ unit: 'px', format: 'a4', orientation: 'portrait' });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  const imgAspect = canvas.height / canvas.width;
  const imgH = pdfW * imgAspect;

  // Multi-page: split tall content across pages
  let yOffset = 0;
  while (yOffset < imgH) {
    if (yOffset > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, -yOffset, pdfW, imgH);
    yOffset += pdfH;
  }

  onProgress?.(100);
  return pdf.output('blob');
}
