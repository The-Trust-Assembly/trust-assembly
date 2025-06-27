import { Hono } from "@hono/hono";
import { Env } from "./env.ts";

function cleanUrl(url: string) {
  return url.replace(/\/(index.html)?\/?$/, "");
}

const app = new Hono<Env>()
  .post("/headlines", async (c) => {
    const { url } = await c.req.json();
    const dbClient = c.var.db;

    const headlineData = await dbClient.getAllCreatorEdits(cleanUrl(url));
    return c.json(headlineData);
  });

export default app;
