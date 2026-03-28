import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-utils";

export const fetchCache = "force-no-store";

const VALID_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 500_000; // 500KB

// POST /api/upload — upload an image to Vercel Blob, returns { url }
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentUserFromRequest(request);
    if (!session) return unauthorized();

    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) return err("No file provided");

    if (!VALID_TYPES.includes(file.type)) {
      return err("Only JPEG, PNG, and WebP images are accepted");
    }
    if (file.size > MAX_SIZE) {
      return err("Image must be under 500KB");
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`avatars/${session.sub}-${Date.now()}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return ok({ url: blob.url });
  } catch (error) {
    return serverError("POST /api/upload", error);
  }
}
