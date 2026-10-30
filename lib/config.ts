// Shared limits for the client and the API.

export const EXPIRY_OPTIONS = [
  { label: "1 hour", seconds: 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
] as const;

export const DEFAULT_EXPIRY_SECONDS = EXPIRY_OPTIONS[1].seconds;

// Wrong passphrase attempts before the secret is destroyed.
export const MAX_FAILED_ATTEMPTS = 5;

export function isSecretId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}
