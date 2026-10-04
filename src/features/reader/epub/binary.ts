const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const textDecoder = new TextDecoder();

export function readZipText(zip: Record<string, Uint8Array>, path: string) {
  const file = zip[normalizeZipPath(path)];
  return file ? textDecoder.decode(file) : '';
}

export function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

export function uint8ToBase64(bytes: Uint8Array) {
  let output = '';
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output +=
      BASE64_CHARS[(chunk >> 18) & 63] +
      BASE64_CHARS[(chunk >> 12) & 63] +
      BASE64_CHARS[(chunk >> 6) & 63] +
      BASE64_CHARS[chunk & 63];
  }

  if (index < bytes.length) {
    let chunk = bytes[index] << 16;
    output += BASE64_CHARS[(chunk >> 18) & 63];
    if (index + 1 < bytes.length) {
      chunk |= bytes[index + 1] << 8;
      output += BASE64_CHARS[(chunk >> 12) & 63] + BASE64_CHARS[(chunk >> 6) & 63] + '=';
    } else {
      output += BASE64_CHARS[(chunk >> 12) & 63] + '==';
    }
  }

  return output;
}
