import { Hono } from "@hono/hono";
import { Env } from "./main.ts";

const app = new Hono<Env>()
  .get("/db", async (c) => {
    const dbClient = c.var.db;
    const result = await dbClient.getAllCreatorEdits("https://www.cnn.com/2024/12/05/politics/john-roberts-transgender-skrmetti-analysis");
    return c.json(result);
  });

export default app;
