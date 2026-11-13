import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIN_SECRET_CHARS, mintPass, verifyPass } from './pass';

const secret = 'a-long-test-secret-for-demo-passes-only';

describe('demo passes (D-128)', () => {
  it('a minted pass verifies to its name', () => {
    const pass = mintPass(secret, 'jury-1');
    expect(pass).toMatch(/^jury-1\.[A-Za-z0-9_-]{43}$/);
    expect(verifyPass(pass, secret)).toBe('jury-1');
  });

  it('refuses another secret, a short secret, tampering and malformed passes', () => {
    const pass = mintPass(secret, 'presenter');
    expect(verifyPass(pass, `${secret}x`)).toBeNull();
    expect(verifyPass(pass, null)).toBeNull();
    expect(verifyPass(pass, 's'.repeat(MIN_SECRET_CHARS - 1))).toBeNull();
    const sig = pass.slice(pass.indexOf('.') + 1);
    expect(verifyPass(`jury-1.${sig}`, secret)).toBeNull();
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyPass(`presenter.${flipped}`, secret)).toBeNull();
    for (const bad of [
      undefined,
      '',
      'presenter',
      `.${sig}`,
      `Presenter.${sig}`,
      `presenter.${sig}=`,
    ])
      expect(verifyPass(bad, secret)).toBeNull();
  });

  it('names are short lowercase slugs', () => {
    expect(() => mintPass(secret, 'Jury 1')).toThrow();
    expect(() => mintPass(secret, 'x'.repeat(33))).toThrow();
  });

  it('the minting script uses the same formula', async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = pathToFileURL(path.resolve(here, '../../../scripts/kiki/demo-pass.mjs')).href;
    const mod = (await import(/* @vite-ignore */ script)) as {
      mintPass: (s: string, n: string) => string;
    };
    expect(mod.mintPass(secret, 'jury-2')).toBe(mintPass(secret, 'jury-2'));
  });
});
