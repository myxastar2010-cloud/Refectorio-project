import { describe, expect, it } from 'vitest';
import { findSecrets } from './check-secrets.mjs';

describe('secret check', () => {
  const key = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';

  it('finds the actual key value anywhere', () => {
    expect(findSecrets(`const x = "${key}";`, [key])).toContain('ключ API');
  });

  it('finds obvious key patterns', () => {
    expect(findSecrets(`headers: { Authorization: 'Client-ID ${key}' }`, [])).not.toEqual([]);
    expect(findSecrets(`UNSPLASH_ACCESS_KEY = "x"; api_key: "${key}"`, [])).not.toEqual([]);
    // Split so this very file passes the check it tests.
    expect(findSecrets(`ghp_${'abcdefghijklmnopqrstuvwxyz0123456789'}`, [])).not.toEqual([]);
  });

  it('ignores placeholders and code that only mentions keys', () => {
    expect(findSecrets('headers: { Authorization: `Client-ID ${key}` }', [])).toEqual([]);
    expect(findSecrets("Authorization: <key>; 'Client-ID <access key>'", [])).toEqual([]);
    expect(findSecrets('const key = await readKey("pexels");', [])).toEqual([]);
  });
});
