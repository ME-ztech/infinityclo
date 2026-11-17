/**
 * Derives the header marks from the brand's own emblem artwork
 * (public/brand/home-01-*.png, the logo published on infinityclo.ca).
 *
 *   emblem.png        the gold emblem, trimmed to its bounds, transparent
 *   emblem-ink.png    the same shape in ink, for monochrome contexts
 *   emblem-paper.png  the same shape in white, for dark photography
 *
 * Only cropping and a flat recolour of the existing shape are applied. Nothing
 * is redrawn.
 */
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve(import.meta.dirname, '..', 'public', 'brand');
const source = path.join(dir, 'home-01-671567d9.png');

// The artwork sits on white: derive alpha from how far a pixel is from white.
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const tint = (colour) => {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const whiteness = Math.min(r, g, b);
    const alpha = Math.round(((255 - whiteness) / 255) * a * 1.25);
    out[i] = colour ? colour[0] : r;
    out[i + 1] = colour ? colour[1] : g;
    out[i + 2] = colour ? colour[2] : b;
    out[i + 3] = Math.min(255, alpha);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width: 480 })
    .png({ compressionLevel: 9 });
};

for (const [name, colour] of [
  ['emblem.png', null],
  ['emblem-ink.png', [17, 17, 17]],
  ['emblem-paper.png', [255, 255, 255]],
]) {
  const file = path.join(dir, name);
  await tint(colour).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(name, `${meta.width}x${meta.height}`);
}
