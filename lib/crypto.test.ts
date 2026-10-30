import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSecret,
  deriveKeys,
  encryptSecret,
  fromBase64Url,
  isLinkKey,
  MAX_SECRET_BYTES,
  toBase64Url,
} from "./crypto.ts";

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", fromBase64Url(value));
  return toBase64Url(new Uint8Array(digest));
}

test("base64url round-trips arbitrary bytes", () => {
  for (const length of [0, 1, 2, 3, 16, 31, 32, 255]) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    assert.deepEqual(fromBase64Url(toBase64Url(bytes)), bytes);
  }
});

test("round-trips a secret without a passphrase", async () => {
  const text = "hunter2 🔐 ünïcödé\nsecond line";
  const { secret, linkKey } = await encryptSecret(text);

  assert.ok(isLinkKey(linkKey));
  assert.equal(secret.p, false);

  const keys = await deriveKeys(linkKey, secret.salt);
  assert.equal(await sha256(keys.auth), secret.authHash);
  assert.equal(await decryptSecret(keys.encKey, secret, false), text);
});

test("round-trips a secret with a passphrase", async () => {
  const { secret, linkKey } = await encryptSecret(
    "db password",
    "correct horse",
  );
  assert.equal(secret.p, true);

  const keys = await deriveKeys(linkKey, secret.salt, "correct horse");
  assert.equal(await sha256(keys.auth), secret.authHash);
  assert.equal(await decryptSecret(keys.encKey, secret, true), "db password");
});

test("a wrong passphrase yields a different auth token and fails to decrypt", async () => {
  const { secret, linkKey } = await encryptSecret(
    "db password",
    "correct horse",
  );
  const keys = await deriveKeys(linkKey, secret.salt, "wrong horse");

  assert.notEqual(await sha256(keys.auth), secret.authHash);
  await assert.rejects(decryptSecret(keys.encKey, secret, true));
});

test("a wrong link key fails to decrypt", async () => {
  const { secret } = await encryptSecret("top secret");
  const other = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const keys = await deriveKeys(other, secret.salt);

  await assert.rejects(decryptSecret(keys.encKey, secret, false));
});

test("flipping the passphrase flag breaks decryption", async () => {
  const { secret, linkKey } = await encryptSecret("top secret");
  const keys = await deriveKeys(linkKey, secret.salt);

  await assert.rejects(decryptSecret(keys.encKey, secret, true));
});

test("tampered ciphertext is rejected", async () => {
  const { secret, linkKey } = await encryptSecret("top secret");
  const bytes = fromBase64Url(secret.ct);
  bytes[5] ^= 0x01;
  const keys = await deriveKeys(linkKey, secret.salt);

  await assert.rejects(
    decryptSecret(keys.encKey, { ...secret, ct: toBase64Url(bytes) }, false),
  );
});

test("ciphertext length is padded to 256-byte blocks", async () => {
  const short = await encryptSecret("a");
  const longer = await encryptSecret("a".repeat(200));
  const tagBytes = 16;

  assert.equal(fromBase64Url(short.secret.ct).length, 256 + tagBytes);
  assert.equal(fromBase64Url(longer.secret.ct).length, 256 + tagBytes);
});

test("every secret gets a fresh key, salt and IV", async () => {
  const a = await encryptSecret("same text");
  const b = await encryptSecret("same text");

  assert.notEqual(a.linkKey, b.linkKey);
  assert.notEqual(a.secret.salt, b.secret.salt);
  assert.notEqual(a.secret.iv, b.secret.iv);
  assert.notEqual(a.secret.ct, b.secret.ct);
});

test("rejects secrets over the size limit", async () => {
  await assert.rejects(encryptSecret("x".repeat(MAX_SECRET_BYTES + 1)));
});
