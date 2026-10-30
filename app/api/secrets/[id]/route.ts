import { isSecretId } from "@/lib/config";
import { json, notFound, tooManyRequests } from "@/lib/http";
import { isRateLimited } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

// Returns the public parameters needed to derive the keys, without burning
// the secret. Link-preview bots that only fetch pages never reach this.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (await isRateLimited("read", request)) return tooManyRequests();

  const { id } = await params;
  if (!isSecretId(id)) return notFound();

  const secret = await getStore().peek(id);
  if (!secret) return notFound();

  return json({ salt: secret.salt, p: secret.p });
}
