import { describe, expect, it } from 'vitest';
import { formatFileSize, getExtension, stripExtension } from './fileUtils';

describe('formatFileSize', () => {
  it('formats bytes across units', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('getExtension', () => {
  it('lowercases and strips the leading dot', () => {
    expect(getExtension('Report.PDF')).toBe('pdf');
    expect(getExtension('archive.tar.gz')).toBe('gz');
    expect(getExtension('noext')).toBe('noext');
  });
});

describe('stripExtension', () => {
  it('removes only the final extension', () => {
    expect(stripExtension('Report.pdf')).toBe('Report');
    expect(stripExtension('archive.tar.gz')).toBe('archive.tar');
    expect(stripExtension('noext')).toBe('noext');
  });
});
