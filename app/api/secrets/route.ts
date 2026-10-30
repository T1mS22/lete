import { randomBytes } from "node:crypto";
import { EXPIRY_OPTIONS } from "@/lib/config";
import { isBase64Url, json, readJson, tooManyRequests } from "@/lib/http";
import { isRateLimited } from "@/lib/ratelimit";
import { getStore, type StoredSecret } from "@/lib/store";

// Base64url lengths for a padded ciphertext of 1 to 65 blocks (16 KiB
// plaintext) plus the 16-byte GCM tag.
const MIN_CIPHERTEXT = 363;
const MAX_CIPHERTEXT = 22_208;
const MAX_BODY_BYTES = 32 * 1024;

function parseBody(
  body: unknown,
): { secret: StoredSecret; ttl: number } | null {
  if (typeof body !== "object" || body === null) return null;
  const { v, ct, iv, salt, p, authHash, ttl } = body as Record<string, unknown>;

  const validTtl = EXPIRY_OPTIONS.some((option) => option.seconds === ttl);
  if (
    v !== 1 ||
    !isBase64Url(ct, MIN_CIPHERTEXT, MAX_CIPHERTEXT) ||
    !isBase64Url(iv, 16, 16) ||
    !isBase64Url(salt, 22, 22) ||
    !isBase64Url(authHash, 43, 43) ||
    typeof p !== "boolean" ||
    !validTtl
  ) {
    return null;
  }

  return { secret: { v, ct, iv, salt, p, authHash }, ttl: ttl as number };
}

export async function POST(request: Request) {
  if (await isRateLimited("create", request)) return tooManyRequests();

  const parsed = parseBody(await readJson(request, MAX_BODY_BYTES));
  if (!parsed) return json({ error: "Invalid secret." }, 400);

  const id = randomBytes(16).toString("base64url");
  const stored = await getStore().put(id, parsed.secret, parsed.ttl);
  if (!stored) return json({ error: "Could not store the secret." }, 500);

  return json(
    { id, expiresAt: new Date(Date.now() + parsed.ttl * 1000).toISOString() },
    201,
  );
}
