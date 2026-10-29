const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Return true only for a PostgreSQL URL that points back to this computer. */
export function isLocalPostgresUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    return LOCAL_DATABASE_HOSTS.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Allow local test accounts to skip email delivery.
 *
 * The database-host check is intentional defense in depth: even if the flag is
 * accidentally copied into a deployed environment, it cannot auto-verify users
 * against a hosted database.
 */
export function shouldAutoVerifyEmail(): boolean {
  return process.env.NODE_ENV !== "production" &&
    process.env.TA_DEV_AUTO_VERIFY_EMAIL?.toLowerCase() === "true" &&
    isLocalPostgresUrl(process.env.POSTGRES_URL);
}
