import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getCurrentUserFromRequest, requireAdmin } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-utils";

const MAX_LENGTH = 1000;
const VALID_STATUSES = ["accepted", "roadmapped", "pending", "completed"];
const VALID_RESOLUTIONS = ["resolved", "needs_work"];

// Table is created by db/schema.sql — no runtime DDL needed.

// POST /api/feedback — submit feedback (any authenticated user)
export async function POST(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return err("Message is required");
  }

  if (message.length > MAX_LENGTH) {
    return err(`Message must be ${MAX_LENGTH} characters or fewer`);
  }


  const result = await sql`
    INSERT INTO feedback (user_id, username, message)
    VALUES (${session.sub}, ${session.username}, ${message.trim()})
    RETURNING id, created_at
  `;

  return ok({ id: result.rows[0].id, created_at: result.rows[0].created_at }, 201);
}

// GET /api/feedback — list feedback
// Admin sees all; regular users see only their own
export async function GET(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();


  const isAdmin = await requireAdmin(request);
  if (isAdmin) {
    const result = await sql`
      SELECT id, username, message, status, admin_reply, admin_reply_at,
             user_resolution, user_resolution_note, user_resolution_at, created_at
      FROM feedback
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return ok({ feedback: result.rows });
  }

  // Regular users see only their own submissions
  const result = await sql`
    SELECT id, username, message, status, admin_reply, admin_reply_at,
           user_resolution, user_resolution_note, user_resolution_at, created_at
    FROM feedback
    WHERE username = ${session.username}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return ok({ feedback: result.rows });
}

// PATCH /api/feedback — admin reply with status, or user resolution
export async function PATCH(request: NextRequest) {
  const session = await getCurrentUserFromRequest(request);
  if (!session) return unauthorized();

  const body = await request.json();
  const { feedbackId, action } = body;

  if (!feedbackId) return err("feedbackId is required");


  if (action === "admin_reply") {
    // Admin replying with status
    const admin = await requireAdmin(request);
    if (!admin) return forbidden("Admin access only");

    const { reply, status } = body;
    if (!reply || typeof reply !== "string" || reply.trim().length === 0) {
      return err("Reply is required");
    }
    if (reply.length > MAX_LENGTH) {
      return err(`Reply must be ${MAX_LENGTH} characters or fewer`);
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return err(`Status must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const result = await sql`
      UPDATE feedback
      SET admin_reply = ${reply.trim()}, status = ${status}, admin_reply_at = now()
      WHERE id = ${feedbackId}::uuid
      RETURNING id, status, admin_reply, admin_reply_at
    `;

    if (result.rows.length === 0) return err("Feedback not found");
    return ok(result.rows[0]);
  }

  if (action === "user_resolution") {
    // User marking completed feedback as resolved or needs_work
    const { resolution, note } = body;
    if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
      return err(`Resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}`);
    }

    // Verify the feedback belongs to this user and is completed
    const check = await sql`
      SELECT id, username, status FROM feedback WHERE id = ${feedbackId}::uuid
    `;
    if (check.rows.length === 0) return err("Feedback not found");
    if (check.rows[0].username !== session.username) return forbidden("You can only resolve your own feedback");
    if (check.rows[0].status !== "completed") return err("Only completed items can be resolved");

    const result = await sql`
      UPDATE feedback
      SET user_resolution = ${resolution},
          user_resolution_note = ${note ? note.trim().slice(0, 500) : null},
          user_resolution_at = now()
      WHERE id = ${feedbackId}::uuid
      RETURNING id, user_resolution, user_resolution_note, user_resolution_at
    `;

    return ok(result.rows[0]);
  }

  return err("Invalid action");
}
