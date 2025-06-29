import { Client } from "https://deno.land/x/postgres/mod.ts";
import { User } from "./env.ts";

type RemoteIdProps = {
  remoteId: string;
  providerType: 'google';
}

export default class BasicDbRepo {

  static async create() {
    const client = new Client({
      user: Deno.env.get("POSTGRES_USER") || "postgres",
      database: Deno.env.get("POSTGRES_DB") || "trust_assembly",
      hostname: Deno.env.get("POSTGRES_HOST") || "localhost",
      port: 5432,
      password: Deno.env.get("POSTGRES_PASSWORD") || "password",
    });
    await client.connect();
    return new BasicDbRepo(client);
  }

  private constructor(private client: Client) { }
  
  async getAllCreatorEdits(url: string) {
    const result = await this.client.queryArray<[string, string, string]>`
      SELECT articles.url, creators.name, article_edits.headline
      FROM creators
      JOIN article_edits ON creators.id = article_edits.creator_id
      JOIN articles ON article_edits.article_id = articles.id
      WHERE articles.url = ${url};
    `;
    return result.rows.map((row: string[]) => ({
      url: row[0],
      creator: row[1],
      headline: row[2],
    }));
  }

  async getUserByLoginProvider({ remoteId, providerType }: RemoteIdProps): Promise<User | null> {
    const result = await this.client.queryObject<User>`
      SELECT u.id, u.display_name AS name, u.email
      FROM identity_providers AS ip
      JOIN users AS u ON ip.user_id = u.id
      WHERE ip.remote_id = ${remoteId} AND ip.provider_type = ${providerType}
      LIMIT 1;
    `;
    return result.rows.find(_ => true) || null;
  }

  async registerUser(
    user: Omit<User, "id">,
    { remoteId, providerType }: RemoteIdProps,
  ): Promise<User> {
    const result = await this.client.queryObject<User>`
      INSERT INTO users (id, email, display_name)
      VALUES (${crypto.randomUUID()}, ${user.email}, ${user.name})
      RETURNING id, email, display_name AS name;
    `;
    const newUser = result.rows[0];

    await this.client.queryArray`
      INSERT INTO identity_providers (id, user_id, remote_id, provider_type)
      VALUES (${crypto.randomUUID()}, ${newUser.id}, ${remoteId}, ${providerType})
    `;

    return newUser;
  }

  [Symbol.dispose]() {
    this.client.end();
  }
}