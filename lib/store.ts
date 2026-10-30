import "server-only";
import { Redis } from "@upstash/redis";

// Stored per secret. Everything here is either ciphertext or public
// parameters; the link key never reaches the server.
export type StoredSecret = {
  v: 1;
  ct: string;
  iv: string;
  salt: string;
  p: boolean;
  authHash: string;
};

interface SecretStore {
  put(id: string, secret: StoredSecret, ttlSeconds: number): Promise<boolean>;
  peek(id: string): Promise<StoredSecret | null>;
  // Atomically reads and deletes, so a secret can only ever be taken once.
  take(id: string): Promise<StoredSecret | null>;
  destroy(id: string): Promise<void>;
  recordFailure(id: string, ttlSeconds: number): Promise<number>;
}

const secretKey = (id: string) => `lete:secret:${id}`;
const failuresKey = (id: string) => `lete:failures:${id}`;

export function redisCredentials() {
  // The Vercel Marketplace integration injects KV_*; a direct Upstash setup
  // uses UPSTASH_REDIS_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

class RedisStore implements SecretStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async put(id: string, secret: StoredSecret, ttlSeconds: number) {
    const result = await this.redis.set(secretKey(id), JSON.stringify(secret), {
      ex: ttlSeconds,
      nx: true,
    });
    return result === "OK";
  }

  async peek(id: string) {
    return parse(await this.redis.get<string>(secretKey(id)));
  }

  async take(id: string) {
    const raw = await this.redis.getdel<string>(secretKey(id));
    if (raw) await this.redis.del(failuresKey(id));
    return parse(raw);
  }

  async destroy(id: string) {
    await this.redis.del(secretKey(id), failuresKey(id));
  }

  async recordFailure(id: string, ttlSeconds: number) {
    const [count] = await this.redis
      .multi()
      .incr(failuresKey(id))
      .expire(failuresKey(id), ttlSeconds)
      .exec<[number, number]>();
    return count;
  }
}

// Local development only: keeps secrets in memory when no Redis is
// configured. Never used in production, where serverless instances don't
// share memory.
class MemoryStore implements SecretStore {
  private entries = new Map<string, { value: string; expiresAt: number }>();

  private read(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(id: string, secret: StoredSecret, ttlSeconds: number) {
    if (this.read(secretKey(id))) return false;
    this.entries.set(secretKey(id), {
      value: JSON.stringify(secret),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  async peek(id: string) {
    return parse(this.read(secretKey(id)));
  }

  async take(id: string) {
    const raw = this.read(secretKey(id));
    this.entries.delete(secretKey(id));
    this.entries.delete(failuresKey(id));
    return parse(raw);
  }

  async destroy(id: string) {
    this.entries.delete(secretKey(id));
    this.entries.delete(failuresKey(id));
  }

  async recordFailure(id: string, ttlSeconds: number) {
    const count = Number(this.read(failuresKey(id)) ?? 0) + 1;
    this.entries.set(failuresKey(id), {
      value: String(count),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return count;
  }
}

function parse(raw: string | null): StoredSecret | null {
  return raw ? (JSON.parse(raw) as StoredSecret) : null;
}

const globalForStore = globalThis as unknown as { leteStore?: SecretStore };

export function getStore(): SecretStore {
  if (globalForStore.leteStore) return globalForStore.leteStore;

  const credentials = redisCredentials();
  if (credentials) {
    globalForStore.leteStore = new RedisStore(
      // Values are JSON strings we parse ourselves.
      new Redis({ ...credentials, automaticDeserialization: false }),
    );
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.",
    );
  } else {
    console.warn("[lete] No Redis configured, using in-memory store.");
    globalForStore.leteStore = new MemoryStore();
  }

  return globalForStore.leteStore;
}
