import { describe, expect, it } from 'vitest';
import { shareableUrl } from './shareUrl';

describe('shareableUrl', () => {
  it('keeps the path and query', () => {
    expect(shareableUrl('https://localkit.example/dev/epoch-converter?t=1700000000')).toBe('https://localkit.example/dev/epoch-converter?t=1700000000');
  });

  it('drops the fragment, which may hold a pairing secret', () => {
    expect(shareableUrl('https://localkit.example/share/send#pair=AbCdEfGhIjKlMnOpQrStUv')).toBe('https://localkit.example/share/send');
    expect(shareableUrl('https://localkit.example/faq?x=1#top')).toBe('https://localkit.example/faq?x=1');
  });
});
