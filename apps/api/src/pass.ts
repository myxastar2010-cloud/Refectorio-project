/**
 * Demo passes (stage 5, phase 0; D-128): a pass is `<name>.<sig>`, where `sig` is base64url(HMAC-SHA256(secret,
 * "kiki-pass:v1:" + name)). The server keeps no list: it re-computes the signature with `KIKI_DEMO_SECRET`. A pass lets
 * a jury's or the presenter's device spend the reserved share of model calls and skip the per-address limits (a whole
 * hall behind one Wi-Fi address). Changing the secret revokes every pass at once. `scripts/kiki/demo-pass.mjs` mints
 * them with the same formula (a test keeps the two in step).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PASS_HEADER = 'x-kiki-pass';
const NAME = /^[a-z0-9-]{1,32}$/;
const SIG = /^[A-Za-z0-9_-]{43}$/;
/** A secret shorter than this is ignored (passes stay off): a guessable secret would make passes forgeable. */
export const MIN_SECRET_CHARS = 32;

const sign = (secret: string, name: string) =>
  createHmac('sha256', secret).update(`kiki-pass:v1:${name}`).digest('base64url');

export function mintPass(secret: string, name: string): string {
  if (!NAME.test(name)) throw new Error('pass name: 1–32 of a–z, 0–9, -');
  return `${name}.${sign(secret, name)}`;
}

/** The pass's name when it is valid for this secret, otherwise null. Constant time in the signature. */
export function verifyPass(
  pass: string | undefined,
  secret: string | null | undefined,
): string | null {
  if (!pass || !secret || secret.length < MIN_SECRET_CHARS) return null;
  const dot = pass.indexOf('.');
  const name = pass.slice(0, dot);
  const sig = pass.slice(dot + 1);
  if (dot < 1 || !NAME.test(name) || !SIG.test(sig)) return null;
  const expected = Buffer.from(sign(secret, name));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? name : null;
}
