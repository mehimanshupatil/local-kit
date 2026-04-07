import { PDFDocument } from '@cantoo/pdf-lib';

export async function isEncrypted(buffer: ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(buffer, { ignoreEncryption: true });
    // Check if it's actually encrypted by trying without password
    await PDFDocument.load(buffer);
    return false;
  } catch {
    return true;
  }
}

export async function unlockPDF(buffer: ArrayBuffer, password: string): Promise<Blob> {
  const doc = await PDFDocument.load(buffer, { password });
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
