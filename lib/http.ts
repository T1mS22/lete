import "server-only";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const tooManyRequests = () =>
  json({ error: "Too many requests. Please try again later." }, 429);

export const notFound = () =>
  json({ error: "This secret doesn't exist or was already viewed." }, 404);

// Reads a JSON body, refusing anything larger than maxBytes.
export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;

  const text = await request.text();
  if (text.length > maxBytes) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isBase64Url(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]*$/.test(value)
  );
}
