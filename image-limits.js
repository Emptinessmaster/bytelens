/* Read dimensions before decoding: bound both compressed input and pixel memory. */
'use strict';
(function () {
  const maxPixels = 32000000;
  const maxBytes = 64 * 1024 * 1024;
  const maxHeaderBytes = 1024 * 1024;

  function dimensions(buffer, mime) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const text = (offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));
    if (mime === 'image/png' && bytes.length >= 24 &&
        view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a &&
        view.getUint32(8) === 13 && text(12, 4) === 'IHDR') {
      return [view.getUint32(16), view.getUint32(20)];
    }
    if (mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset++] !== 0xff) break;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
          return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
        }
        offset += length;
      }
    }
    if (mime === 'image/webp' && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const kind = text(offset, 4);
        const length = view.getUint32(offset + 4, true);
        const p = offset + 8;
        if (p + length > bytes.length && !['VP8X', 'VP8 ', 'VP8L'].includes(kind)) break;
        if (kind === 'VP8X' && length >= 10 && p + 10 <= bytes.length) {
          return [1 + bytes[p + 4] + (bytes[p + 5] << 8) + (bytes[p + 6] << 16),
            1 + bytes[p + 7] + (bytes[p + 8] << 8) + (bytes[p + 9] << 16)];
        }
        if (kind === 'VP8 ' && length >= 10 && p + 10 <= bytes.length &&
            bytes[p + 3] === 0x9d && bytes[p + 4] === 0x01 && bytes[p + 5] === 0x2a) {
          return [view.getUint16(p + 6, true) & 0x3fff, view.getUint16(p + 8, true) & 0x3fff];
        }
        if (kind === 'VP8L' && length >= 5 && p + 5 <= bytes.length && bytes[p] === 0x2f) {
          const packed = view.getUint32(p + 1, true);
          return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
        }
        offset = p + length + (length % 2);
      }
    }
    throw new Error('Invalid image header or header exceeds 1 MiB');
  }

  async function validate(file) {
    if (file.size > maxBytes) throw new RangeError('Image exceeds 64 MiB');
    const [width, height] = dimensions(await file.slice(0, maxHeaderBytes).arrayBuffer(), file.type);
    if (!width || !height || width * height > maxPixels || width > 32768 || height > 32768) {
      throw new RangeError('Image exceeds safe dimensions');
    }
  }
  window.ImageLimits = { validate, maxPixels };
})();
