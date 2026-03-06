import { sql } from "@vercel/postgres";

// Re-export the sql tagged template from @vercel/postgres.
// Vercel Postgres reads POSTGRES_URL from environment automatically.
// For local dev, set POSTGRES_URL in .env.local.
export { sql };
