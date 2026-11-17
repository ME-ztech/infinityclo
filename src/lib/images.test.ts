import { describe, expect, it } from 'vitest';

import { allowedImageHosts, allowedImageUrl } from './images';

describe('allowedImageUrl', () => {
  it('accepts image files on this site', () => {
    expect(allowedImageUrl('/products/a/01.jpg')).toBe('/products/a/01.jpg');
    expect(allowedImageUrl(' /brand/emblem.png ')).toBe('/brand/emblem.png');
  });

  it('rejects traversal, protocol-relative and non-image paths', () => {
    for (const bad of ['/products/../../etc/passwd.jpg', '//evil.example/x.jpg', '/admin', 'javascript:alert(1)', 42, null]) {
      expect(allowedImageUrl(bad)).toBeNull();
    }
  });

  it('accepts an external https image only on an allowed host', () => {
    const hosts = allowedImageHosts('media.example.com, bad host, ');
    expect(hosts).toEqual(['media.example.com']);
    expect(allowedImageUrl('https://media.example.com/a.jpg', hosts)).toBe('https://media.example.com/a.jpg');
    expect(allowedImageUrl('https://evil.example/a.jpg', hosts)).toBeNull();
    expect(allowedImageUrl('http://media.example.com/a.jpg', hosts)).toBeNull();
    expect(allowedImageUrl('https://media.example.com.evil.example/a.jpg', hosts)).toBeNull();
  });

  it('allows no external host by default', () => {
    expect(allowedImageUrl('https://cdn.shopify.com/x.jpg', allowedImageHosts(undefined))).toBeNull();
  });
});
