import { Hono } from "@hono/hono";
import { Env } from "./main.ts";
import sampleReplacementHeadlines from "./sampleReplacementHeadlines.ts";

const app = new Hono<Env>()
  .get("/", async (c) => {
    return c.json(sampleReplacementHeadlines)
  });

export default app;
