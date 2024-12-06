import { Context, Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import { poweredBy } from "@hono/hono/powered-by";
import { extract } from '@extractus/article-extractor';
import { serveStatic } from "@hono/hono/serve-static";
import { trimTrailingSlash } from '@hono/hono/trailing-slash'
import { Client } from "https://deno.land/x/postgres/mod.ts";
import fakeData from "./fakeDb.ts";

const app = new Hono();

const dbClient = new Client({
  user: Deno.env.get("POSTGRES_USER"),
  database: Deno.env.get("POSTGRES_DB"),
  hostname: Deno.env.get("POSTGRES_HOST"),
  port: 5432,
  password: Deno.env.get("POSTGRES_PASSWORD"),
});

app.use("/api/*", async (_, next) => {
  try {
    await dbClient.connect();
    await next();
  } catch (e) {
    console.error("Error connecting to database", e);
    throw e;
  } finally {
    await dbClient.end();
  }
});

const corsPolicy = cors({
  origin: ["*"], // TODO: Change this to trust-assembly.org, or whatever URL we're using frontend URL
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
});

app.use("*", logger(), poweredBy());
app.use(
  "*",
  corsPolicy,
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

app.get("/api/db-test", async (c: Context) => {
  const result = await dbClient.queryArray("SELECT * FROM information_schema.tables");
  return c.json(result.rows);
});

const v1Api = new Hono();
v1Api.use(
  "*",
  corsPolicy
);

type HeadlineData = {
  headline: string;
  creator: string;
}
const transformedHeadlines = (url: string): Promise<HeadlineData[]> => {
  return Promise.resolve(
    fakeData
      .filter(data => url.startsWith(data.url))
      .map(({ headline, creator }) => ({
        headline,
        creator,
      }))
  );
};

v1Api.post("/headlines", async (c: Context) => {
  const { url } = await c.req.json();

  const headlineData = await transformedHeadlines(url);
  return c.json(headlineData);
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
