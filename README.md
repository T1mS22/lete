# Lete

One-time secret sharing at [secret.t-s.dev](https://secret.t-s.dev). Paste a
password or token, get a link that works exactly once, then the secret is gone.

Named after Lete (HD 102195 b), an exoplanet named for Lethe, the river of
forgetfulness.

## How it works

Everything is encrypted in the browser. The server only stores ciphertext and
never sees the secret or the key.

1. The browser generates a random 256-bit **link key** and encrypts the secret
   with AES-256-GCM (Web Crypto, random 96-bit IV).
2. Only the ciphertext goes to the server, which stores it in Redis under a
   random 128-bit ID with a TTL (1 hour, 1 day or 7 days).
3. The link is `https://secret.t-s.dev/s/<id>#<link key>`. Browsers never send
   the part after `#` to the server.
4. Opening the link burns nothing. The recipient clicks **Reveal**, which
   proves possession of the key to the server; the server then atomically
   reads and deletes the secret (`GETDEL`) and the browser decrypts it.

Key derivation (see [`lib/crypto.ts`](lib/crypto.ts)):

```
ikm       = linkKey                                       (no passphrase)
          = linkKey || PBKDF2-SHA256(passphrase, salt, 600k) (passphrase)
encKey    = HKDF-SHA256(ikm, salt, "lete/v1/enc")   -> AES-256-GCM
authToken = HKDF-SHA256(ikm, salt, "lete/v1/auth")  -> server stores SHA-256(authToken)
```

- Someone who only knows the ID (e.g. from logs) can't burn the secret.
- A wrong passphrase doesn't burn it either; after 5 wrong attempts it's
  destroyed.
- The plaintext is padded to 256-byte blocks so the ciphertext only leaks a
  coarse size.
- The version and passphrase flag are bound as AES-GCM associated data.

## Security headers

- Strict nonce-based Content Security Policy ([`proxy.ts`](proxy.ts)): only
  our own scripts run and the page only talks to its own API.
- `Referrer-Policy: no-referrer`, HSTS, `X-Frame-Options: DENY`,
  `Cache-Control: no-store` on secret pages and the API, no indexing.
- No analytics or other third-party scripts. Keep it that way: any script on
  the page could read the key from the URL.

## Abuse limits

Creating secrets needs no login, so the API enforces per-IP rate limits
(20 secrets/hour, 60 reads/10 min), a 16 KB size limit and a 7-day maximum
TTL. On the free tiers, the worst case is the service pausing, never a bill.

## Development

Requires Node 26 and Yarn 4.

```bash
yarn install
yarn dev
```

Without Redis credentials, `yarn dev` uses an in-memory store and skips rate
limiting. Production refuses to start without Redis.

```bash
yarn test   # crypto round-trip and tamper tests
yarn lint
yarn build
```

## Deployment

1. Import the repo as a new Vercel project (Node 26 is the default).
2. **Storage → Marketplace → Upstash Redis**, region Frankfurt, free plan.
   Connecting it injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Set the Vercel Functions region to `fra1`.
4. Add the domain `secret.t-s.dev` in Vercel, then in Cloudflare DNS add a
   `CNAME secret → cname.vercel-dns.com` with the proxy **off** (DNS only).
