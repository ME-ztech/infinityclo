import { describe, expect, it } from 'vitest';

import { resolveSiteUrl } from './site';

describe('resolveSiteUrl', () => {
  it('uses a well-formed origin as given, without a trailing slash or path', () => {
    expect(resolveSiteUrl('https://infinityclo.ca/')).toBe('https://infinityclo.ca');
    expect(resolveSiteUrl('https://staging.example.com/some/path')).toBe('https://staging.example.com');
    expect(resolveSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('adds https to a bare host', () => {
    expect(resolveSiteUrl('infinityclo.ca')).toBe('https://infinityclo.ca');
    expect(resolveSiteUrl(' my-preview.vercel.app ')).toBe('https://my-preview.vercel.app');
  });

  it('falls back instead of throwing on anything unusable', () => {
    for (const bad of [undefined, '', '   ', 'not a url', 'https://', 'undefined']) {
      expect(resolveSiteUrl(bad)).toBe('https://infinityclo.ca');
    }
  });
});
