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

  async createHeadlineReplacement(
    userId: string,
    data: {
      originalHeadline: string;
      replacementHeadline: string;
      url: string;
      citations: Array<{ url: string; explanation: string }>;
    }
  ): Promise<{ id: string }> {
    const replacementId = crypto.randomUUID();

    await this.client.queryArray`BEGIN`;
    try {
      // Insert headline replacement
      await this.client.queryArray`
        INSERT INTO headline_replacements (id, user_id, url, original_headline, replacement_headline)
        VALUES (${replacementId}, ${userId}, ${data.url}, ${data.originalHeadline}, ${data.replacementHeadline})
      `;

      // Batch insert citations
      if (data.citations.length > 0) {
        // Build VALUES clause for batch insert
        const valuesClause = data.citations.map((_citation, index) =>
          `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`
        ).join(', ');

        // Flatten citation data into array of parameters
        const params = data.citations.flatMap(citation => [
          replacementId,
          citation.url,
          citation.explanation
        ]);

        await this.client.queryArray(
          `INSERT INTO headline_replacement_citations (headline_replacement_id, citation_url, explanation)
           VALUES ${valuesClause}`,
          params
        );
      }

      await this.client.queryArray`COMMIT`;
    } catch (error) {
      await this.client.queryArray`ROLLBACK`;

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Failed to create headline replacement:", {
        userId,
        url: data.url,
        error: errorMessage
      });

      // Transform database constraint violations into user-friendly messages
      if (errorMessage.includes("char_length")) {
        throw new Error("Headline must be between 1 and 120 characters");
      }
      if (errorMessage.includes("null value") && errorMessage.includes("violates not-null")) {
        throw new Error("All required fields must be provided");
      }
      if (errorMessage.includes("duplicate key") || errorMessage.includes("unique constraint")) {
        throw new Error("A replacement for this article already exists");
      }
      if (errorMessage.includes("violates foreign key constraint")) {
        throw new Error("Referenced record does not exist");
      }
      if (errorMessage.includes("headline_replacements_user_id_fkey")) {
        throw new Error("Invalid user ID");
      }

      throw error;
    }

    return { id: replacementId };
  }

  [Symbol.dispose]() {
    this.client.end();
  }
}