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
  const { message, promptSuggestion } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return err("Message is required");
  }

  if (message.length > MAX_LENGTH) {
    return err(`Message must be ${MAX_LENGTH} characters or fewer`);
  }

  if (promptSuggestion && promptSuggestion.length > 5000) {
    return err("Prompt suggestion must be 5000 characters or fewer");
  }

  const result = await sql`
    INSERT INTO feedback (user_id, username, message, prompt_suggestion)
    VALUES (${session.sub}, ${session.username}, ${message.trim()}, ${promptSuggestion?.trim() || null})
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
  // Fetch feedback items
  const feedbackResult = isAdmin ? await sql`
    SELECT id, username, message, prompt_suggestion, status, admin_reply, admin_reply_at,
           user_resolution, user_resolution_note, user_resolution_at, created_at
    FROM feedback ORDER BY created_at DESC LIMIT 200
  ` : await sql`
    SELECT id, username, message, prompt_suggestion, status, admin_reply, admin_reply_at,
           user_resolution, user_resolution_note, user_resolution_at, created_at
    FROM feedback WHERE username = ${session.username} ORDER BY created_at DESC LIMIT 50
  `;

  // Fetch threaded replies for all feedback items
  const feedbackIds = feedbackResult.rows.map((r: Record<string, unknown>) => r.id);
  let repliesMap: Record<string, Array<Record<string, unknown>>> = {};
  if (feedbackIds.length > 0) {
    const repliesResult = await sql.query(
      `SELECT fr.id, fr.feedback_id, fr.is_admin, fr.message, fr.created_at, u.username
       FROM feedback_replies fr LEFT JOIN users u ON u.id = fr.user_id
       WHERE fr.feedback_id = ANY($1) ORDER BY fr.created_at ASC`,
      [feedbackIds]
    );
    for (const r of repliesResult.rows) {
      if (!repliesMap[r.feedback_id]) repliesMap[r.feedback_id] = [];
      repliesMap[r.feedback_id].push(r);
    }
  }

  const feedback = feedbackResult.rows.map((f: Record<string, unknown>) => ({
    ...f,
    replies: repliesMap[f.id as string] || [],
  }));

  return ok({ feedback });
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

  if (action === "reply") {
    // Threaded reply — admin or feedback owner can reply
    const { message: replyMsg } = body;
    if (!replyMsg || typeof replyMsg !== "string" || replyMsg.trim().length === 0) return err("Reply message is required");
    if (replyMsg.length > 2000) return err("Reply must be 2000 characters or fewer");

    const check = await sql`SELECT id, username FROM feedback WHERE id = ${feedbackId}::uuid`;
    if (check.rows.length === 0) return err("Feedback not found");

    const admin = await requireAdmin(request);
    const isOwner = check.rows[0].username === session.username;
    if (!admin && !isOwner) return forbidden("You can only reply to your own feedback");

    const result = await sql`
      INSERT INTO feedback_replies (feedback_id, user_id, is_admin, message)
      VALUES (${feedbackId}::uuid, ${session.sub}, ${!!admin}, ${replyMsg.trim()})
      RETURNING id, is_admin, message, created_at
    `;
    return ok(result.rows[0], 201);
  }

  return err("Invalid action");
}
