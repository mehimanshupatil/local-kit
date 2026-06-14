async function digestToHex(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashText(text: string): Promise<{ sha256: string; sha512: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const [sha256Buffer, sha512Buffer] = await Promise.all([
    window.crypto.subtle.digest('SHA-256', data),
    window.crypto.subtle.digest('SHA-512', data),
  ]);
  return {
    sha256: await digestToHex(sha256Buffer),
    sha512: await digestToHex(sha512Buffer),
  };
}

export async function hashFile(file: File): Promise<{ sha256: string; sha512: string }> {
  const buffer = await file.arrayBuffer();
  const [sha256Buffer, sha512Buffer] = await Promise.all([
    window.crypto.subtle.digest('SHA-256', buffer),
    window.crypto.subtle.digest('SHA-512', buffer),
  ]);
  return {
    sha256: await digestToHex(sha256Buffer),
    sha512: await digestToHex(sha512Buffer),
  };
}
