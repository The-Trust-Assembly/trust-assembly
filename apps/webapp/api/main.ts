import { Context, Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import { poweredBy } from "@hono/hono/powered-by";
import { extract } from '@extractus/article-extractor';
import { serveStatic } from "@hono/hono/serve-static";
import { trimTrailingSlash } from '@hono/hono/trailing-slash'

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

app.use(trimTrailingSlash());

app.get("/api", (c: Context) => {
  return c.text("Hello Deno!");
});

app.get("/api/parsedArticle", async (c: Context) => {
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

app.route("/api/v1", v1Api);

app.use("/api/*", async (c: Context) => {
  c.status(404);
  return c.json({ error: "Not found" });
});

// all non-api routes are served from the dist folder where
// the Vite build output is located (react frontend)
app.use("*", serveStatic({
  root: "./dist",
  getContent: async (path) => {
    console.log("Reading file", path);
    try {
      return await Deno.readFile(path);
    } catch {
      return await Deno.readFile("dist/index.html");
    }
  }
}));

Deno.serve(app.fetch);
