/**
 * Community photo uploads.
 *
 * An upload is treated as hostile until proven otherwise:
 *
 *   1. Size is capped before anything is parsed.
 *   2. The type is decided by the file's magic bytes, never by its name or the
 *      browser-supplied content type. Only JPEG, PNG and WebP are accepted, so
 *      an HTML or SVG file renamed `.jpg` is refused.
 *   3. The image is decoded and re-encoded to JPEG. Re-encoding drops EXIF
 *      (including GPS position) and anything appended to or hidden in the file.
 *   4. The stored name is random; nothing from the uploader reaches the path.
 *
 * Files are written under `<DATA_DIR>/uploads/community/`, outside `public/`,
 * and served only by the media route: publicly once staff approve the
 * submission, or with a short-lived signed token for moderation previews.
 */
import 'server-only';

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from './config';
import { seal, unseal } from './security';
import { getStore } from './store';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2000;
export const MEDIA_FILENAME = /^[a-f0-9]{32}\.jpg$/;
const PREVIEW_PURPOSE = 'community-media-preview';

export type ImageKind = 'jpeg' | 'png' | 'webp';

/** Identifies an image by signature. Returns null for everything else. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415 | 503,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/** Uploads need a disk that outlives the request. Serverless hosts do not have one. */
export function uploadsEnabled(): boolean {
  return getStore().durable && !process.env.VERCEL;
}

export function uploadDirectory(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), config.storage.dataDir, 'uploads', 'community');
}

export interface ProcessedImage {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
}

type SharpFactory = (input: Buffer, options?: Record<string, unknown>) => {
  rotate(): ReturnType<SharpFactory>;
  resize(options: Record<string, unknown>): ReturnType<SharpFactory>;
  flatten(options: Record<string, unknown>): ReturnType<SharpFactory>;
  jpeg(options: Record<string, unknown>): ReturnType<SharpFactory>;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
};

async function loadSharp(): Promise<SharpFactory> {
  try {
    const name = 'sharp';
    const loaded = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)) as { default?: SharpFactory };
    const factory = loaded.default ?? (loaded as unknown as SharpFactory);
    if (typeof factory !== 'function') throw new Error('unexpected module shape');
    return factory;
  } catch {
    // Fail closed: without a decoder the file cannot be made safe, so it is refused.
    throw new UploadError('Photo uploads are not available on this deployment.', 503);
  }
}

/** Validates and re-encodes an upload. Throws `UploadError` for anything unacceptable. */
export async function processUpload(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.length === 0) throw new UploadError('Choose a photo to upload.', 400);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError('Photos must be 8 MB or smaller.', 413);
  if (!sniffImage(bytes)) throw new UploadError('Upload a JPEG, PNG or WebP photo.', 415);

  const sharp = await loadSharp();
  try {
    const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError('That file could not be read as a photo.', 415);
  }
}

export async function storeUpload(image: ProcessedImage): Promise<{ file: string; url: string }> {
  const file = `${randomBytes(16).toString('hex')}.jpg`;
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, file), image.buffer, { flag: 'wx' });
  return { file, url: mediaUrl(file) };
}

export const mediaUrl = (file: string): string => `/api/community/media/${file}`;

export const fileFromMediaUrl = (url: string): string | null => {
  const file = url.split('?')[0]?.split('/').pop() ?? '';
  return MEDIA_FILENAME.test(file) ? file : null;
};

export async function readUpload(file: string): Promise<Buffer | null> {
  if (!MEDIA_FILENAME.test(file)) return null;
  try {
    return await readFile(path.join(uploadDirectory(), file));
  } catch {
    return null;
  }
}

/**
 * A preview URL for a file that is not public yet. For admin moderation only:
 * the token is sealed, bound to this one file and expires after an hour.
 */
export function signedMediaUrl(file: string, ttlSeconds = 3600): string | null {
  if (!MEDIA_FILENAME.test(file)) return null;
  const token = seal({ file }, PREVIEW_PURPOSE, ttlSeconds);
  return token ? `${mediaUrl(file)}?t=${token}` : null;
}

export function isValidPreviewToken(file: string, token: string | null): boolean {
  return unseal<{ file: string }>(token, PREVIEW_PURPOSE)?.file === file;
}
