import assert from "node:assert/strict";
import test from "node:test";

import {
  isLocalPostgresUrl,
  shouldAutoVerifyEmail,
} from "../src/lib/development-environment.ts";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  POSTGRES_URL: process.env.POSTGRES_URL,
  TA_DEV_AUTO_VERIFY_EMAIL: process.env.TA_DEV_AUTO_VERIFY_EMAIL,
};

function setEnvironment(name: keyof typeof ORIGINAL_ENV, value: string | undefined) {
  const environment = process.env as Record<string, string | undefined>;
  if (value === undefined) delete environment[name];
  else environment[name] = value;
}

function restoreEnvironment() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    setEnvironment(key as keyof typeof ORIGINAL_ENV, value);
  }
}

test.afterEach(restoreEnvironment);
test.after(restoreEnvironment);

test("recognizes only loopback PostgreSQL connection URLs as local", () => {
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@localhost:5432/trust_assembly"), true);
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@127.0.0.1:5432/trust_assembly"), true);
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@[::1]:5432/trust_assembly"), true);
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@db.example.com:5432/trust_assembly"), false);
  assert.equal(isLocalPostgresUrl("not a database URL"), false);
  assert.equal(isLocalPostgresUrl(undefined), false);
});

test("allows automatic email verification only in local development", () => {
  setEnvironment("NODE_ENV", "development");
  setEnvironment("TA_DEV_AUTO_VERIFY_EMAIL", "true");
  setEnvironment("POSTGRES_URL", "postgresql://user:pass@localhost:5432/trust_assembly");
  assert.equal(shouldAutoVerifyEmail(), true);
});

test("cannot auto-verify email against a hosted database", () => {
  setEnvironment("NODE_ENV", "development");
  setEnvironment("TA_DEV_AUTO_VERIFY_EMAIL", "true");
  setEnvironment("POSTGRES_URL", "postgresql://user:pass@db.example.com:5432/trust_assembly");
  assert.equal(shouldAutoVerifyEmail(), false);
});

test("cannot auto-verify email in production even with a loopback URL", () => {
  setEnvironment("NODE_ENV", "production");
  setEnvironment("TA_DEV_AUTO_VERIFY_EMAIL", "true");
  setEnvironment("POSTGRES_URL", "postgresql://user:pass@localhost:5432/trust_assembly");
  assert.equal(shouldAutoVerifyEmail(), false);
});

test("requires an explicit opt-in for local automatic verification", () => {
  setEnvironment("NODE_ENV", "development");
  setEnvironment("TA_DEV_AUTO_VERIFY_EMAIL", "false");
  setEnvironment("POSTGRES_URL", "postgresql://user:pass@localhost:5432/trust_assembly");
  assert.equal(shouldAutoVerifyEmail(), false);
});
