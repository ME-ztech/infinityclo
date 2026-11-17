// One-off, idempotent: re-encode oversized community PNG screenshots as JPEG.
// Format conversion only - no crop, retouch or upscale.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const ugcFile = path.join(root, 'src/data/catalog/ugc.json');
const assetsFile = path.join(root, 'src/data/catalog/brand-assets.json');
const ugc = JSON.parse(await readFile(ugcFile, 'utf8'));
const assets = JSON.parse(await readFile(assetsFile, 'utf8'));
let saved = 0;
for (const entry of ugc) {
  if (!entry.media.url.endsWith('.png')) continue;
  const source = path.join(root, 'public', entry.media.url);
  const nextUrl = entry.media.url.replace(/\.png$/, '.jpg');
  const before = (await readFile(source)).length;
  const buffer = await sharp(source).flatten({ background: '#ffffff' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  await writeFile(path.join(root, 'public', nextUrl), buffer);
  await unlink(source);
  saved += before - buffer.length;
  const record = assets.assets.find((asset) => asset.url === entry.media.url);
  if (record) { record.url = nextUrl; record.bytes = buffer.length; record.note = 'Re-encoded PNG to JPEG (quality 86) for delivery; pixels otherwise untouched.'; }
  entry.media.url = nextUrl;
}
await writeFile(ugcFile, JSON.stringify(ugc, null, 2) + '\n');
await writeFile(assetsFile, JSON.stringify(assets, null, 2) + '\n');
console.log('saved MB', (saved / 1048576).toFixed(1));
