import { Context, Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import { poweredBy } from "@hono/hono/powered-by";
import { extract } from '@extractus/article-extractor';

const app = new Hono();

app.use("*", logger(), poweredBy());
app.use(
  "*",
  cors({
    origin: ["*"], // TODO: Change this to trust-assembly.org, or whatever URL we're using frontend URL
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);
app.get("/", (c: Context) => {
  return c.text("Hello Deno!");
});

app.get("/parsedArticle", async (c: Context) => {
  const url = c.req.query("url");
  if (!url) {
    c.status(400);
    return c.json({ error: "URL is required" });
  }
  const parsed = await extract(url);
  return c.json(parsed);
});

const v1Api = new Hono();

const transformHeadline = (headline: string): Promise<string> => {
  // TODO: Implement the logic to transform the headline using OpenAI
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(headline.toUpperCase());
    }, 100); // Simulating some asynchronous operation
  });
};

v1Api.post("/headline", async (c: Context) => {
  const { headline } = await c.req.json();

  const transformedText = await transformHeadline(headline);
  return c.json({ transformedText });
});

app.route("/v1", v1Api);

Deno.serve(app.fetch);
