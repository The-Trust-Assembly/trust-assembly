import { Context } from "@hono/hono";
import { Env, User } from "./env.ts";

export function currentUser(c: Context<Env, "*", {}>): User {
  const session = c.var.session;
  const user = session.get('user');
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}