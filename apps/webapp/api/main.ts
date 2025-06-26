import { Context, Hono, MiddlewareHandler } from "@hono/hono";
import { cors } from "@hono/hono/cors";
import { logger } from "@hono/hono/logger";
import { poweredBy } from "@hono/hono/powered-by";
import { serveStatic } from "@hono/hono/serve-static";
import { trimTrailingSlash } from '@hono/hono/trailing-slash'
import { createMiddleware } from '@hono/hono/factory'
import BasicDbRepo from "./basicDbRepo.ts";
import { 
  Session,
  sessionMiddleware, 
  CookieStore 
} from 'jsr:@jcs224/hono-sessions'
import sessions from "./sessions.ts";
import test from "./test.ts";
import replacements from "./replacements.ts";
import transformations from "./transformations.ts";
import v1Api from "./v1Api.ts";

type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
  }
};

export type Env = {
  Variables: {
    db: BasicDbRepo;
    session: Session<SessionData>;
    session_key_rotation: boolean;
  },
};

const corsPolicy = cors({
  origin: ["*"], // TODO: Change this to trust-assembly.org, or whatever URL we're using frontend URL
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
});

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

const dbMiddleware = createMiddleware(async (c, next) => {
  using db = await BasicDbRepo.create();
  c.set('db', db);
  await next()
});

const apiApp = new Hono<Env>()
  .use('*', sessionMiddlewareHanlder)
  .use("*", dbMiddleware)
  .route("/", sessions)
  .route("/", transformations)
  .route("/test", test)
  .route("/replacements", replacements)
  .route("/v1", v1Api)
  .get("/", (c) => {
    return c.text("Hello Deno!");
  })
  .use("*", async (c: Context) => {
    c.status(404);
    return c.json({ error: "Not found" });
  });

const rootApp = new Hono<Env>()
  .use("*", logger(), poweredBy())
  .use(
    "*",
    corsPolicy,
  )
  .use(trimTrailingSlash())
  .route("/api", apiApp)
  .use("*", serveStatic({
    // all non-api routes are served from the dist folder where
    // the Vite build output is located (react frontend)
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

Deno.serve(rootApp.fetch);
