export function resolvePort(value: string | undefined): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function resolveCorsOrigins(value: string | undefined): string[] {
  const rawOrigins = value === undefined ? 'http://localhost:5173' : value;
  const origins = rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must list exact origins; wildcard is not allowed');
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.origin !== origin
    ) {
      throw new Error(`CORS_ORIGINS entries must be exact HTTP(S) origins: ${origin}`);
    }
  }

  return origins;
}

export function requireJwtSecret(value: string | undefined): string {
  if (!value || value.trim().length < 32) {
    throw new Error('JWT_SECRET is required and must contain at least 32 characters');
  }
  return value;
}
