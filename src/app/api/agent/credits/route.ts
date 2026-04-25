import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { ok, forbidden, err, serverError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// Credit cost per run based on scope and platform count
function calculateCost(scope: string, platformCount: number): number {
  const baseCost =
    scope === "single" ? 1
    : scope === "top3" ? 1
    : scope === "top10" ? 2
    : scope === "pages5" ? 3
    : scope === "max" ? 3
    : scope === "30d" ? 2
    : scope === "phantom-feed" ? 1
    : scope === "ward-scan" ? 2
    : 1;

  // Multi-platform multiplier: each extra platform adds 1 credit
  const platformExtra = Math.max(0, platformCount - 1);
  return baseCost + platformExtra;
}

// GET /api/agent/credits
// ------------------------
// Returns the current user's credit balance and pricing info.
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    const result = await sql`
      SELECT agent_credits FROM users WHERE id = ${session.sub} LIMIT 1
    `;
    const credits = result.rows[0]?.agent_credits ?? 0;

    return ok({
      credits,
      pricing: {
        perRun: { single: 1, top3: 1, top10: 2, pages5: 3, max: 3, "30d": 2 },
        perExtraPlatform: 1,
        packs: [
          { credits: 25, price: "$5", pricePerRun: "$0.20" },
          { credits: 60, price: "$10", pricePerRun: "$0.17" },
          { credits: 150, price: "$20", pricePerRun: "$0.13" },
        ],
      },
    });
  } catch (e) {
    return serverError("/api/agent/credits GET", e);
  }
}

// POST /api/agent/credits
// -------------------------
// Purchase credits (DUMMY — no payment processing yet).
// Body: { pack: 25 | 60 | 150 }
//
// In production this would verify a Stripe payment, then add credits.
// For now it just returns a message pointing to the payment flow.
export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return forbidden("Login required");

  try {
    const body = await request.json().catch(() => ({}));
    const pack = body.pack;

    const validPacks: Record<number, string> = {
      25: "$5",
      60: "$10",
      150: "$20",
    };

    if (!pack || !validPacks[pack]) {
      return err("Invalid credit pack. Choose 25, 60, or 150 credits.");
    }

    // DUMMY: In production, redirect to Stripe checkout here.
    // For now, return a message explaining what will happen.
    return ok({
      message: `Credit purchase coming soon. ${pack} credits for ${validPacks[pack]}. Payment integration is being set up.`,
      pack,
      price: validPacks[pack],
      dummy: true,
    });
  } catch (e) {
    return serverError("/api/agent/credits POST", e);
  }
}
