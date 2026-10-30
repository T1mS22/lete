import { createHash, timingSafeEqual } from "node:crypto";
import { isSecretId, MAX_FAILED_ATTEMPTS } from "@/lib/config";
import {
  isBase64Url,
  json,
  notFound,
  readJson,
  tooManyRequests,
} from "@/lib/http";
import { isRateLimited } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

// Failure counters outlive the longest possible secret.
const FAILURE_TTL_SECONDS = 7 * 24 * 60 * 60;

function authMatches(auth: string, authHash: string): boolean {
  const actual = createHash("sha256")
    .update(Buffer.from(auth, "base64url"))
    .digest();
  const expected = Buffer.from(authHash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Burns the secret and returns its ciphertext, but only to a caller who
// proves they hold the link key (and passphrase, if one was set).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (await isRateLimited("read", request)) return tooManyRequests();

  const { id } = await params;
  if (!isSecretId(id)) return notFound();

  const body = (await readJson(request, 1024)) as { auth?: unknown } | null;
  const auth = body?.auth;
  if (!isBase64Url(auth, 43, 43))
    return json({ error: "Invalid request." }, 400);

  const store = getStore();
  const secret = await store.peek(id);
  if (!secret) return notFound();

  if (!authMatches(auth, secret.authHash)) {
    const failures = await store.recordFailure(id, FAILURE_TTL_SECONDS);
    if (failures >= MAX_FAILED_ATTEMPTS) {
      await store.destroy(id);
      return json(
        { error: "Too many wrong attempts. The secret has been destroyed." },
        410,
      );
    }
    return json(
      {
        error: "Wrong passphrase.",
        attemptsLeft: MAX_FAILED_ATTEMPTS - failures,
      },
      403,
    );
  }

  // If two correct requests race, only one gets the secret back.
  const taken = await store.take(id);
  if (!taken) return notFound();

  return json({ ct: taken.ct, iv: taken.iv });
}
