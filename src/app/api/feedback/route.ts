import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-utils";

const ADMIN_USERNAME = "thekingofamerica";
const MAX_LENGTH = 1000;

// Ensure table exists
let tableChecked = false;
async function ensureTable() {
  if (tableChecked) return;
  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      username VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)
  `;
  tableChecked = true;
}

// POST /api/feedback — submit feedback (any authenticated user)
export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return err("Message is required");
  }

  if (message.length > MAX_LENGTH) {
    return err(`Message must be ${MAX_LENGTH} characters or fewer`);
  }

  await ensureTable();

  const result = await sql`
    INSERT INTO feedback (user_id, username, message)
    VALUES (${session.sub}, ${session.username}, ${message.trim()})
    RETURNING id, created_at
  `;

  return ok({ id: result.rows[0].id, created_at: result.rows[0].created_at }, 201);
}

// GET /api/feedback — list all feedback (admin only)
export async function GET() {
  const session = await getCurrentUser();
  if (!session) return unauthorized();

  if (session.username !== ADMIN_USERNAME) {
    return forbidden("Admin access only");
  }

  await ensureTable();

  const result = await sql`
    SELECT id, username, message, created_at
    FROM feedback
    ORDER BY created_at DESC
    LIMIT 200
  `;

  return ok({ feedback: result.rows });
}
