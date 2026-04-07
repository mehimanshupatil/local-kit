let workerSet = false;

async function getPdfjsLib() {
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerSet) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.min.mjs';
    workerSet = true;
  }
  return pdfjsLib;
}

export async function loadPDFDocument(arrayBuffer: ArrayBuffer) {
  const lib = await getPdfjsLib();
  return lib.getDocument({ data: arrayBuffer }).promise;
}
