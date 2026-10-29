import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import nextEnv from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const repositoryRoot = process.cwd();
loadEnvConfig(repositoryRoot);

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) throw new Error("POSTGRES_URL is missing from .env.local");

const databaseUrl = new URL(connectionString);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
if (!localHosts.has(databaseUrl.hostname.toLowerCase())) {
  throw new Error(
    `Refusing to seed test agents into non-local database host: ${databaseUrl.hostname}`,
  );
}

const outputDirectory = path.join(repositoryRoot, ".dev");
const credentialsPath = path.join(outputDirectory, "local-test-agents.json");
const agentDefinitions = Array.from({ length: 5 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    username: `ta_test_agent_${number}`,
    displayName: `Trust Assembly Test Agent ${number}`,
    email: `ta-test-agent-${number}@example.invalid`,
  };
});

async function loadSavedCredentials() {
  try {
    const saved = JSON.parse(await readFile(credentialsPath, "utf8"));
    return new Map(
      (Array.isArray(saved.agents) ? saved.agents : [])
        .filter(agent => agent?.username && agent?.password)
        .map(agent => [agent.username, agent.password]),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw new Error(`Could not read ${credentialsPath}: ${error.message}`);
  }
}

const savedPasswords = await loadSavedCredentials();
const agents = agentDefinitions.map(agent => ({
  ...agent,
  password: savedPasswords.get(agent.username) || randomBytes(18).toString("base64url"),
}));

const pool = new Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const organizations = await client.query(`
    SELECT id, name, is_general_public
    FROM organizations
    ORDER BY is_general_public ASC, created_at ASC
  `);
  if (organizations.rows.length === 0) {
    throw new Error("No assemblies exist. Create an assembly before seeding its test members.");
  }

  for (const agent of agents) {
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(agent.password, salt);
    const existing = await client.query(
      "SELECT id FROM users WHERE username = $1",
      [agent.username],
    );

    const userResult = await client.query(`
      INSERT INTO users (
        username, display_name, email, password_hash, salt,
        gender, age, bio, email_verified, email_verified_at
      ) VALUES ($1, $2, $3, $4, $5, 'Undisclosed', 'Undisclosed', $6, TRUE, now())
      ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        salt = EXCLUDED.salt,
        email_verified = TRUE,
        email_verified_at = COALESCE(users.email_verified_at, now())
      RETURNING id
    `, [
      agent.username,
      agent.displayName,
      agent.email,
      passwordHash,
      salt,
      "Reusable local test account. Not a real person.",
    ]);
    const userId = userResult.rows[0].id;

    for (const organization of organizations.rows) {
      const membership = await client.query(`
        INSERT INTO organization_members (org_id, user_id, is_active, left_at)
        VALUES ($1, $2, TRUE, NULL)
        ON CONFLICT (org_id, user_id) DO UPDATE SET
          is_active = TRUE,
          left_at = NULL
        RETURNING (xmax = 0) AS inserted
      `, [organization.id, userId]);

      if (membership.rows[0].inserted) {
        await client.query(`
          INSERT INTO organization_member_history (org_id, user_id, action)
          VALUES ($1, $2, 'joined')
        `, [organization.id, userId]);
      }
    }

    await client.query(
      "UPDATE users SET primary_org_id = $1 WHERE id = $2",
      [organizations.rows[0].id, userId],
    );

    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO audit_log (action, user_id, entity_type, entity_id, metadata)
        VALUES ($1, $2, 'user', $2, $3::jsonb)
      `, [
        `@${agent.username} created as a local test agent`,
        userId,
        JSON.stringify({ username: agent.username, localTestAgent: true }),
      ]);
    }
  }

  await client.query("COMMIT");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(credentialsPath, `${JSON.stringify({
    warning: "Local test credentials. Do not commit or use in production.",
    database: {
      host: databaseUrl.hostname,
      name: databaseUrl.pathname.replace(/^\//, ""),
    },
    agents,
  }, null, 2)}\n`, "utf8");

  console.log(`Prepared ${agents.length} local test agents.`);
  console.log(`Joined each agent to ${organizations.rows.length} assembl${organizations.rows.length === 1 ? "y" : "ies"}.`);
  console.log(`Credentials saved to ${credentialsPath}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
