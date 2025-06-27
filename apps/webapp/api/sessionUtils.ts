import { Context } from "@hono/hono";
import { Env } from "./main.ts";

export type SessionData = {
  user: User;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export function currentUser(c: Context<Env, "*", {}>): User {
  const session = c.var.session;
  const user = session.get('user');
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}