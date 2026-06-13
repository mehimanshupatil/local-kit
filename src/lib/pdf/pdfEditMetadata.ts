import { PDFDocument } from '@cantoo/pdf-lib';

export interface PDFMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
}

export async function readPDFMetadata(buffer: ArrayBuffer): Promise<PDFMetadata> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const kw = doc.getKeywords();
  const creationDate = doc.getCreationDate();
  const modDate = doc.getModificationDate();

  const keywordsStr = Array.isArray(kw)
    ? kw.join(', ')
    : (kw ?? '');

  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: keywordsStr,
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: creationDate ? creationDate.toISOString().slice(0, 10) : '',
    modificationDate: modDate ? modDate.toISOString().slice(0, 10) : '',
  };
}

export async function editPDFMetadata(
  buffer: ArrayBuffer,
  meta: PDFMetadata,
): Promise<Blob> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

  // Read originals so we know which fields actually existed.
  // Only call a setter when the new value is non-empty OR the field already
  // existed — calling a setter with '' on a field that never existed injects
  // spurious XMP entries (e.g. xmp:CreatorTool → "Encoding software").
  const kw = doc.getKeywords();
  const origCreator  = doc.getCreator()  ?? '';
  const origProducer = doc.getProducer() ?? '';
  const origTitle    = doc.getTitle()    ?? '';
  const origAuthor   = doc.getAuthor()   ?? '';
  const origSubject  = doc.getSubject()  ?? '';
  const origKw       = Array.isArray(kw) ? kw.join(', ') : (kw ?? '');
  const origCreation = doc.getCreationDate();
  const origMod      = doc.getModificationDate();

  const setIf = (val: string, orig: string, fn: (v: string) => void) => {
    if (val !== '' || orig !== '') fn(val);
  };

  setIf(meta.title,    origTitle,    v => doc.setTitle(v));
  setIf(meta.author,   origAuthor,   v => doc.setAuthor(v));
  setIf(meta.subject,  origSubject,  v => doc.setSubject(v));
  setIf(meta.creator,  origCreator,  v => doc.setCreator(v));
  setIf(meta.producer, origProducer, v => doc.setProducer(v));

  if (meta.keywords !== '' || origKw !== '') {
    doc.setKeywords(meta.keywords.split(',').map(k => k.trim()).filter(Boolean));
  }

  if (meta.creationDate) {
    doc.setCreationDate(new Date(meta.creationDate));
  } else if (origCreation) {
    doc.setCreationDate(origCreation);
  }

  if (meta.modificationDate) {
    doc.setModificationDate(new Date(meta.modificationDate));
  } else if (origMod) {
    doc.setModificationDate(origMod);
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
