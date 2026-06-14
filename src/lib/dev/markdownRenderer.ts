import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdown(markdown: string): string {
  const raw = marked(markdown) as string;
  if (typeof window === 'undefined') return raw;

  return DOMPurify.sanitize(raw);
}
