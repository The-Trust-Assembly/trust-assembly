import { clearSessionCookie } from "@/lib/auth";
import { ok } from "@/lib/api-utils";

export async function POST() {
  await clearSessionCookie();
  return ok({ success: true });
}
