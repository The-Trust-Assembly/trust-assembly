import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  resetAndMigrateDatabase,
  validateDisposableDatabaseUrl,
} from "./test-database-helpers.mjs";

const { Client } = pg;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.TEST_POSTGRES_URL;
const { databaseName } = validateDisposableDatabaseUrl(connectionString);

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited with code ${child.exitCode}\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/orgs`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next server\n${logs.join("")}`);
}

async function request(baseUrl, route, { token, body, expected = 200, ip } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (ip) headers["x-forwarded-for"] = ip;
  const response = await fetch(`${baseUrl}${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.equal(
    response.status,
    expected,
    `${route} returned ${response.status}, expected ${expected}: ${text}`,
  );
  return data;
}

async function register(baseUrl, index) {
  return request(baseUrl, "/api/auth/register", {
    expected: 201,
    ip: `198.51.100.${index + 1}`,
    body: {
      username: `api_user_${index}`,
      displayName: `API User ${index}`,
      email: `api-user-${index}@example.test`,
      password: "Integration-password-123!",
    },
  });
}

async function createAssembly(baseUrl, client, token, name) {
  const org = await request(baseUrl, "/api/orgs", {
    token,
    expected: 201,
    body: { name, description: "Disposable API integration fixture" },
  });
  await client.query("UPDATE organizations SET enrollment_mode = 'open' WHERE id = $1", [org.id]);
  return org;
}

async function acceptAndVote(baseUrl, user, submissionId, approve) {
  const jury = await request(baseUrl, "/api/jury", { token: user.token });
  const assignment = jury.assignments.find(item =>
    item.submission_id === submissionId && item.role === "in_group"
  );
  assert.ok(assignment, `expected an in-group assignment for ${user.username}`);
  await request(baseUrl, `/api/jury/${assignment.id}/accept`, {
    token: user.token,
    body: {},
  });
  return request(baseUrl, `/api/submissions/${submissionId}/vote`, {
    token: user.token,
    body: { approve, note: approve ? "Fixture approves" : "Fixture rejects", role: "in_group" },
  });
}

async function stopServerTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === "win32") {
    // Next may leave compiler workers holding stdout open after the parent is
    // stopped. Kill the exact spawned process tree so local runs terminate.
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

const client = new Client({ connectionString });
await client.connect();
let server;
const serverLogs = [];

try {
  const migrations = await resetAndMigrateDatabase(client, repositoryRoot);
  assert.ok(migrations.length > 0);
  console.log(`Applied ${migrations.length} migrations to ${databaseName}.`);

  const port = await getOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      POSTGRES_URL: connectionString,
      JWT_SECRET: "api-integration-test-secret-not-for-production",
      TA_DEV_AUTO_VERIFY_EMAIL: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appendLog = chunk => {
    serverLogs.push(String(chunk));
    if (serverLogs.length > 200) serverLogs.shift();
  };
  server.stdout.on("data", appendLog);
  server.stderr.on("data", appendLog);
  await waitForServer(baseUrl, server, serverLogs);
  console.log("Next API server is ready.");

  const users = [];
  for (let index = 0; index < 6; index += 1) users.push(await register(baseUrl, index));
  console.log("Registered the six-user assembly fixture.");

  const primaryOrg = await createAssembly(baseUrl, client, users[0].token, "API Golden Path Assembly");
  for (const user of users.slice(1)) {
    await request(baseUrl, `/api/orgs/${primaryOrg.id}/join`, {
      token: user.token,
      expected: 201,
      body: {},
    });
  }

  // Exercise normal jury rules while keeping the actual assembly fixture small.
  // These users are global-count ballast only and never receive memberships.
  await client.query(`
    INSERT INTO users (username, display_name, email, password_hash, salt, email_verified)
    SELECT 'api_filler_' || n, 'API Filler ' || n,
           'api-filler-' || n || '@example.test', 'unused', 'unused', TRUE
    FROM generate_series(1, 94) AS n
  `);

  const articleUrl = "https://news.example.test/integration-story?utm_source=fixture";
  const submissionPayload = {
    submissionType: "correction",
    url: articleUrl,
    originalHeadline: "Fixture headline overstates the evidence",
    replacement: "Fixture headline accurately describes the evidence",
    reasoning: "The source supports a narrower statement.",
    author: "Fixture Reporter",
    orgId: primaryOrg.id,
    evidence: [{ url: "https://evidence.example.test/report", explanation: "Primary source" }],
    inlineEdits: [{ original: "everyone agrees", replacement: "two respondents agreed", reasoning: "Correct count" }],
  };
  const submission = await request(baseUrl, "/api/submissions", {
    token: users[0].token,
    expected: 201,
    body: submissionPayload,
  });
  assert.equal(submission.status, "pending_review");

  await request(baseUrl, `/api/submissions/${submission.id}/vote`, {
    token: users[0].token,
    expected: 403,
    body: { approve: true, role: "in_group" },
  });

  const firstVote = await acceptAndVote(baseUrl, users[1], submission.id, true);
  assert.equal(firstVote.status, "voted");
  await request(baseUrl, `/api/submissions/${submission.id}/vote`, {
    token: users[1].token,
    expected: 409,
    body: { approve: true, role: "in_group" },
  });
  const secondVote = await acceptAndVote(baseUrl, users[2], submission.id, true);
  assert.equal(secondVote.status, "resolved");
  assert.equal(secondVote.resolution.outcome, "approved");
  console.log("Approved golden-path correction through jury review.");

  const corrections = await request(
    baseUrl,
    `/api/corrections?url=${encodeURIComponent("https://news.example.test/integration-story")}`,
  );
  assert.equal(corrections.corrections.length, 1);
  assert.equal(corrections.corrections[0].replacement, submissionPayload.replacement);
  assert.equal(corrections.corrections[0].evidence.length, 1);
  assert.equal(corrections.corrections[0].inlineEdits.length, 1);

  const reputation = await client.query(
    "SELECT total_wins, current_streak FROM users WHERE id = $1",
    [users[0].id],
  );
  assert.deepEqual(reputation.rows[0], { total_wins: 1, current_streak: 1 });

  await request(baseUrl, "/api/submissions", {
    token: users[0].token,
    expected: 409,
    body: submissionPayload,
  });

  const rejected = await request(baseUrl, "/api/submissions", {
    token: users[0].token,
    expected: 201,
    body: { ...submissionPayload, url: "https://news.example.test/rejected-story" },
  });
  await acceptAndVote(baseUrl, users[3], rejected.id, false);
  const rejectionVote = await acceptAndVote(baseUrl, users[4], rejected.id, false);
  assert.equal(rejectionVote.resolution.outcome, "rejected");
  const losses = await client.query("SELECT total_losses, current_streak FROM users WHERE id = $1", [users[0].id]);
  assert.deepEqual(losses.rows[0], { total_losses: 1, current_streak: 0 });
  console.log("Verified rejection and reputation reset.");

  await client.query("UPDATE users SET email_verified = FALSE WHERE id = $1", [users[5].id]);
  await request(baseUrl, "/api/submissions", {
    token: users[5].token,
    expected: 403,
    body: { ...submissionPayload, url: "https://news.example.test/unverified-story" },
  });
  await client.query("UPDATE users SET email_verified = TRUE WHERE id = $1", [users[5].id]);

  const outsider = await register(baseUrl, 7);
  await request(baseUrl, "/api/submissions", {
    token: outsider.token,
    expected: 400,
    body: { ...submissionPayload, url: "https://news.example.test/non-member-story" },
  });

  const smallOrg = await createAssembly(baseUrl, client, outsider.token, "API Too Small Assembly");
  const waiting = await request(baseUrl, "/api/submissions", {
    token: outsider.token,
    expected: 201,
    body: { ...submissionPayload, url: "https://news.example.test/waiting-story", orgId: smallOrg.id },
  });
  assert.equal(waiting.status, "pending_jury");
  const waitingAssignments = await client.query(
    "SELECT COUNT(*)::int AS count FROM jury_assignments WHERE submission_id = $1",
    [waiting.id],
  );
  assert.equal(waitingAssignments.rows[0].count, 0);

  await client.query(`
    CREATE FUNCTION fail_api_fixture_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.url = 'https://evidence.example.test/force-rollback' THEN
        RAISE EXCEPTION 'intentional integration-test rollback';
      END IF;
      RETURN NEW;
    END $$
  `);
  await client.query(`
    CREATE TRIGGER api_fixture_evidence_failure
    BEFORE INSERT ON submission_evidence
    FOR EACH ROW EXECUTE FUNCTION fail_api_fixture_evidence()
  `);
  const rollbackUrl = "https://news.example.test/rollback-story";
  await request(baseUrl, "/api/submissions", {
    token: users[0].token,
    expected: 500,
    body: {
      ...submissionPayload,
      url: rollbackUrl,
      evidence: [{ url: "https://evidence.example.test/force-rollback", explanation: "Trigger rollback" }],
    },
  });
  const rolledBack = await client.query("SELECT COUNT(*)::int AS count FROM submissions WHERE url = $1", [rollbackUrl]);
  assert.equal(rolledBack.rows[0].count, 0);
  await client.query("DROP TRIGGER api_fixture_evidence_failure ON submission_evidence");
  await client.query("DROP FUNCTION fail_api_fixture_evidence()");
  console.log("Verified submission transaction rollback.");

  const secondOrg = await createAssembly(baseUrl, client, users[0].token, "API Second Assembly");
  for (const user of users.slice(1, 5)) {
    await request(baseUrl, `/api/orgs/${secondOrg.id}/join`, {
      token: user.token,
      expected: 201,
      body: {},
    });
  }
  const sameArticleOtherOrg = await request(baseUrl, "/api/submissions", {
    token: users[0].token,
    expected: 201,
    body: { ...submissionPayload, orgId: secondOrg.id },
  });
  assert.notEqual(sameArticleOtherOrg.id, submission.id);

  console.log(`API golden path and failure regressions passed on ${databaseName}.`);
} catch (error) {
  if (serverLogs.length) console.error(serverLogs.join(""));
  throw error;
} finally {
  await stopServerTree(server);
  await client.end();
}
