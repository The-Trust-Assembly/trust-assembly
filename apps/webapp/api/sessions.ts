import { Hono } from "@hono/hono";
import { Env } from "./main.ts";
import { authenticateToken, JwtDecodeError, JwtVerificationError } from "./auth.ts";

const app = new Hono<Env>()
  .post("/login", async (c) => {
    const { token } = await c.req.json();

    if (!token) {
      c.status(400);
      return c.json({ error: "Token is required" });
    }

    try {
      const payload = await authenticateToken(token);

      // TODO: replace with query to users table
      const user = {
        id: payload.sub,
        name: payload.name,
        email: payload.email,
      };
  
      const session = c.var.session;
      session.set('user', user);
      return c.json(user);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      if (e instanceof JwtDecodeError) {
        c.status(400);
        return c.json({ error: `Invalid token: ${error.message}` });
      }

      c.status(401);
    
      if (e instanceof JwtVerificationError) {
        return c.json({ error: `Signature invalid: ${error.message}` });
      }

      return c.json({ error: `Unauthorized: ${error.message}` });
    }
  })
  .get("/user", (c) => {
    const session = c.var.session;
    const user = session.get('user');
    if (!user) {
      c.status(401);
      return c.json({ error: "Unauthorized" });
    }

    return c.json(user);
  });

export default app;
