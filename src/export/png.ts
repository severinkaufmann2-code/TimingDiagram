/** Turns an SVG picture into a PNG, using the browser's own renderer. */

import type { Drawing } from './picture';

/** Browsers refuse canvases beyond roughly this many pixels per side. */
const MAX_SIDE = 16000;
const MAX_AREA = 100_000_000;

export async function pictureToPng(picture: Drawing, pixelRatio = 2): Promise<Blob> {
  const ratio = Math.min(
    pixelRatio,
    MAX_SIDE / picture.width,
    MAX_SIDE / picture.height,
    Math.sqrt(MAX_AREA / (picture.width * picture.height)),
  );
  const width = Math.max(1, Math.round(picture.width * ratio));
  const height = Math.max(1, Math.round(picture.height * ratio));

  const url = URL.createObjectURL(new Blob([picture.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the picture could not be drawn'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no drawing surface available');
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be encoded'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
