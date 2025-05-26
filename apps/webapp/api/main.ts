import { Context, Hono, MiddlewareHandler } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import { poweredBy } from "@hono/hono/powered-by";
import { extract } from '@extractus/article-extractor';
import { serveStatic } from "@hono/hono/serve-static";
import { trimTrailingSlash } from '@hono/hono/trailing-slash'
import { createMiddleware } from '@hono/hono/factory'
import BasicDbRepo from "./basicDbRepo.ts";
import transformHeadline from "./cliInterface.ts";
import { 
  Session,
  sessionMiddleware, 
  CookieStore 
} from 'jsr:@jcs224/hono-sessions'
import { authenticateToken, JwtDecodeError, JwtVerificationError } from "./auth.ts";

type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
  }
};

type Env = {
  Variables: {
    db: BasicDbRepo;
    session: Session<SessionData>;
    session_key_rotation: boolean;
  },
};

const app = new Hono<Env>();

const corsPolicy = cors({
  origin: ["*"], // TODO: Change this to trust-assembly.org, or whatever URL we're using frontend URL
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
});

// Middleware for the routes must be defined before the routes
app.use("*", logger(), poweredBy());
app.use(
  "*",
  corsPolicy,
);

const store = new CookieStore()
const sessionMiddlewareHanlder = sessionMiddleware({
  store,
  encryptionKey: 'password_at_least_32_characters_long', // TODO: change this to a secure key
  expireAfterSeconds: 900, // Expire session after 15 minutes of inactivity
  cookieOptions: {
    sameSite: 'Lax',
    path: '/', // Required for this library to work properly
    httpOnly: true, // Recommended to avoid XSS attacks
  },
}) as unknown as MiddlewareHandler<Env, string, {}>;

app.use('/api/*', sessionMiddlewareHanlder);

const dbMiddleware = createMiddleware(async (c, next) => {
  using db = await BasicDbRepo.create();
  c.set('db', db);
  await next()
});

app.use("/api/*", dbMiddleware);

app.use(trimTrailingSlash());

app.get("/api/transformedHeadline", async (c) => {
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
});

app.get("/api", (c) => {
  return c.text("Hello Deno!");
});

app.get("/api/parsedArticle", async (c) => {
  const url = c.req.query("url");
  if (!url) {
    c.status(400);
    return c.json({ error: "URL is required" });
  }
  const parsed = await extract(url);
  return c.json(parsed);
});

app.get("/api/db-test", async (c) => {
  const dbClient = c.var.db;
  const result = await dbClient.getAllCreatorEdits("https://www.cnn.com/2024/12/05/politics/john-roberts-transgender-skrmetti-analysis");
  return c.json(result);
});

app.get("/api/user", (c) => {
  const session = c.var.session;
  const user = session.get('user');
  if (!user) {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }

  return c.json(user);
});

app.post("/api/login", async (c) => {
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


});

const v1Api = new Hono<Env>();
v1Api.use(
  "*",
  corsPolicy
);

type HeadlineData = {
  headline: string;
  creator: string;
}

function cleanUrl(url: string) {
  return url.replace(/\/(index.html)?\/?$/, "");
}

v1Api.post("/headlines", async (c: Context) => {
  const { url } = await c.req.json();
  const dbClient = c.var.db;

  const headlineData = await dbClient.getAllCreatorEdits(cleanUrl(url));
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
