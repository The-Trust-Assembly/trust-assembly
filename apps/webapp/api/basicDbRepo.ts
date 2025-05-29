import { Client } from "https://deno.land/x/postgres/mod.ts";

// temporary DB repo. Will likely move to Drizzle
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

  [Symbol.dispose]() {
    this.client.end();
  }
}