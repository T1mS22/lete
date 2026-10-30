import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { redisCredentials } from "./store";

// Creating secrets is open to anyone, so per-IP limits keep the service (and
// the Upstash free tier) from being flooded.
const LIMITS = {
  create: Ratelimit.slidingWindow(20, "1 h"),
  read: Ratelimit.slidingWindow(60, "10 m"),
} as const;

type LimitKind = keyof typeof LIMITS;

const globalForLimits = globalThis as unknown as {
  leteLimiters?: Record<LimitKind, Ratelimit> | null;
};

function getLimiters() {
  if (globalForLimits.leteLimiters !== undefined) {
    return globalForLimits.leteLimiters;
  }

  const credentials = redisCredentials();
  // Without Redis (local development) requests are not limited.
  globalForLimits.leteLimiters = credentials
    ? (Object.fromEntries(
        Object.entries(LIMITS).map(([kind, limiter]) => [
          kind,
          new Ratelimit({
            redis: new Redis(credentials),
            limiter,
            prefix: `lete:ratelimit:${kind}`,
          }),
        ]),
      ) as Record<LimitKind, Ratelimit>)
    : null;

  return globalForLimits.leteLimiters;
}

function clientIp(request: Request): string {
  // Vercel sets both headers and overwrites any value sent by the client.
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function isRateLimited(
  kind: LimitKind,
  request: Request,
): Promise<boolean> {
  const limiters = getLimiters();
  if (!limiters) return false;

  const { success } = await limiters[kind].limit(clientIp(request));
  return !success;
}
