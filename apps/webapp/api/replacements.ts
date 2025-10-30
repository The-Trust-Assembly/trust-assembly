import { Hono } from "@hono/hono";
import { Env } from "./env.ts";
import sampleReplacementHeadlines from "./sampleReplacementHeadlines.ts";
import { currentUser } from "./sessionUtils.ts";

type CreateReplacementRequest = {
  originalHeadline: string;
  replacementHeadline: string;
  url: string;
  citations: Array<{ url: string; explanation: string }>;
};

const app = new Hono<Env>()
  .get("/", async (c) => {
    return c.json(sampleReplacementHeadlines)
  })
  .post("/", async (c) => {
    // Validate user is authenticated
    try {
      const user = currentUser(c);

      // Parse and validate request body
      const body = await c.req.json() as CreateReplacementRequest;

      const originalHeadline = body.originalHeadline?.trim();
      const replacementHeadline = body.replacementHeadline?.trim();
      const url = body.url?.trim();

      // Validate required fields
      if (!originalHeadline || !replacementHeadline || !url || !body.citations) {
        c.status(400);
        return c.json({ error: "Missing required fields: originalHeadline, replacementHeadline, url, and citations are required" });
      }

      // Validate headline length constraints (1-120 characters)
      if (originalHeadline.length > 120) {
        c.status(400);
        return c.json({ error: "originalHeadline must be between 1 and 120 characters" });
      }

      if (replacementHeadline.length > 120) {
        c.status(400);
        return c.json({ error: "replacementHeadline must be between 1 and 120 characters" });
      }

      // Validate citations is an array
      if (!Array.isArray(body.citations)) {
        c.status(400);
        return c.json({ error: "citations must be an array" });
      }

      // Validate and process each citation (trim URLs but not explanations)
      const processedCitations: Array<{ url: string; explanation: string }> = [];
      for (const citation of body.citations) {
        const trimmedUrl = citation.url?.trim();

        if (!trimmedUrl || !citation.explanation?.trim()) {
          c.status(400);
          return c.json({ error: "Each citation must have a url and explanation" });
        }

        processedCitations.push({
          url: trimmedUrl,
          explanation: citation.explanation
        });
      }

      // Insert into database
      const db = c.var.db;
      const result = await db.createHeadlineReplacement(user.id, {
        originalHeadline,
        replacementHeadline,
        url,
        citations: processedCitations,
      });

      return c.json({ success: true, id: result.id });
    } catch (error) {
      if (error instanceof Error) { 
        if (error.message === "User not found") {
          c.status(401);
          return c.json({ error: "Unauthorized: Please log in" });
        }
        if (error.message.includes("must be between") || 
            error.message === "Invalid user ID" ||
            error.message === "A replacement for this article already exists" ||
            error.message === "All required fields must be provided" ||
            error.message === "Referenced record does not exist") {
          c.status(400);
          return c.json({ error: error.message });
        }
      }

      console.error("Error creating headline replacement:", error);
      c.status(500);
      return c.json({ error: "Internal server error" });
    }
  });

export default app;
