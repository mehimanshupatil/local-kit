import { nanoid } from 'nanoid';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function generateId(): string {
  return nanoid(8);
}

export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}
