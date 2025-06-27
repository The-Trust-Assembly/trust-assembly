import { Hono } from "@hono/hono";
import { Env } from "./env.ts";
import { extract } from "@extractus/article-extractor";
import transformHeadline from "./cliInterface.ts";

const app = new Hono<Env>()
  .get("/transformedHeadline", async (c) => {
    const url = c.req.query("url");
    const author = c.req.query("author");

    if (!url || !author) {
      c.status(400);
      return c.json({ error: "URL and author are required" });
    }

    try {
      // First parse the article
      const parsed = await extract(url);
      if (!parsed || !parsed.title || !parsed.content) {
        c.status(400);
        return c.json({ error: "Could not parse article" });
      }

      // Then transform the headline
      const result = await transformHeadline({
        title: parsed.title,
        author,
        content: parsed.content,
      });

      // Return the result
      return c.json(result);
    } catch (error) {
      c.status(500);
      console.error(error);
      return c.json({ error: "Error processing request" });
    }
  })
  .get("/parsedArticle", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      c.status(400);
      return c.json({ error: "URL is required" });
    }
    const parsed = await extract(url);
    return c.json(parsed);
  });

export default app;
