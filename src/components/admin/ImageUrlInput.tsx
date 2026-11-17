'use client';

import { useRef, useState } from 'react';

import { inputClass } from './ui';

/**
 * Image URL field with suggestions from the catalogue's Shopify CDN photos and,
 * when the Admin API is connected, a direct upload to Shopify Files.
 */
export function ImageUrlInput({
  name,
  defaultValue,
  uploadAction,
  label,
}: {
  name: string;
  defaultValue?: string;
  uploadAction?: (form: FormData) => Promise<{ url?: string; error?: string }>;
  label: string;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          list="cms-image-suggestions"
          className={inputClass}
          placeholder="https://cdn.shopify.com/…"
          aria-label={label}
        />
        {uploadAction && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setStatus('Uploading…');
                const data = new FormData();
                data.set('file', file);
                const result = await uploadAction(data);
                if (result.url) {
                  setValue(result.url);
                  setStatus('Uploaded to Shopify.');
                } else setStatus(result.error ?? 'Upload failed.');
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="border-ink shrink-0 border px-3 text-xs font-semibold uppercase"
            >
              Upload
            </button>
          </>
        )}
      </div>
      {status && (
        <p className="text-xs text-neutral-600" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
