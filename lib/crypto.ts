// End-to-end encryption for Lete. Runs in the browser (and in Node for tests);
// the server only ever sees ciphertext. The link key travels in the URL
// fragment, which browsers never send to the server.
//
// Scheme (v1):
//   linkKey   = 32 random bytes, base64url in the URL fragment
//   ikm       = linkKey               (no passphrase)
//             = linkKey || PBKDF2-SHA256(passphrase, salt, 600k)  (passphrase)
//   encKey    = HKDF-SHA256(ikm, salt, "lete/v1/enc")  -> AES-256-GCM key
//   authToken = HKDF-SHA256(ikm, salt, "lete/v1/auth") -> proves possession of
//               the key (and passphrase) to the server before it burns the
//               secret; the server only stores SHA-256(authToken).
// The plaintext is padded to 256-byte blocks so the ciphertext length only
// leaks a coarse size.

export const MAX_SECRET_BYTES = 16 * 1024;

const PBKDF2_ITERATIONS = 600_000;
const PAD_BLOCK = 256;
const LENGTH_PREFIX = 4;

export type EncryptedSecret = {
  v: 1;
  ct: string;
  iv: string;
  salt: string;
  p: boolean;
  authHash: string;
};

export type SecretKeys = {
  encKey: CryptoKey;
  auth: string;
};

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(value: string): Bytes {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isLinkKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

function concat(a: Uint8Array, b: Uint8Array): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function additionalData(hasPassphrase: boolean): Bytes {
  // Binds the version and passphrase flag to the ciphertext, so the server
  // can't flip either without decryption failing.
  return encoder.encode(`lete/v1/${hasPassphrase ? 1 : 0}`);
}

function pad(plaintext: Uint8Array): Bytes {
  const size =
    Math.ceil((LENGTH_PREFIX + plaintext.length) / PAD_BLOCK) * PAD_BLOCK;
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, plaintext.length);
  out.set(plaintext, LENGTH_PREFIX);
  return out;
}

function unpad(padded: Uint8Array): Uint8Array {
  const length = new DataView(
    padded.buffer,
    padded.byteOffset,
    padded.byteLength,
  ).getUint32(0);
  if (LENGTH_PREFIX + length > padded.length) {
    throw new Error("Invalid padding");
  }
  return padded.subarray(LENGTH_PREFIX, LENGTH_PREFIX + length);
}

export async function deriveKeys(
  linkKey: string,
  salt: string,
  passphrase?: string,
): Promise<SecretKeys> {
  const saltBytes = fromBase64Url(salt);
  let ikm = fromBase64Url(linkKey);

  if (passphrase) {
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const stretched = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
      },
      passphraseKey,
      256,
    );
    ikm = concat(ikm, new Uint8Array(stretched));
  }

  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);

  const encKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,
      info: encoder.encode("lete/v1/enc"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  const auth = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,
      info: encoder.encode("lete/v1/auth"),
    },
    baseKey,
    256,
  );

  return { encKey, auth: toBase64Url(new Uint8Array(auth)) };
}

export async function encryptSecret(
  text: string,
  passphrase?: string,
): Promise<{ secret: EncryptedSecret; linkKey: string }> {
  const plaintext = encoder.encode(text);
  if (plaintext.length > MAX_SECRET_BYTES) {
    throw new Error("Secret is too large");
  }

  const linkKey = toBase64Url(randomBytes(32));
  const salt = toBase64Url(randomBytes(16));
  const iv = randomBytes(12);
  const hasPassphrase = Boolean(passphrase);
  const { encKey, auth } = await deriveKeys(linkKey, salt, passphrase);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(hasPassphrase) },
    encKey,
    pad(plaintext),
  );
  const authHash = await crypto.subtle.digest("SHA-256", fromBase64Url(auth));

  return {
    linkKey,
    secret: {
      v: 1,
      ct: toBase64Url(new Uint8Array(ciphertext)),
      iv: toBase64Url(iv),
      salt,
      p: hasPassphrase,
      authHash: toBase64Url(new Uint8Array(authHash)),
    },
  };
}

export async function decryptSecret(
  encKey: CryptoKey,
  ciphertext: { ct: string; iv: string },
  hasPassphrase: boolean,
): Promise<string> {
  const padded = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64Url(ciphertext.iv),
      additionalData: additionalData(hasPassphrase),
    },
    encKey,
    fromBase64Url(ciphertext.ct),
  );
  return decoder.decode(unpad(new Uint8Array(padded)));
}
