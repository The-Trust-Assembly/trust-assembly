import { AbstractMigration, Info, ClientPostgreSQL } from "https://deno.land/x/nessie@2.0.11/mod.ts";

export default class extends AbstractMigration<ClientPostgreSQL> {
    /** Runs on migrate */
    async up(info: Info): Promise<void> {
        await this.client.queryArray`CREATE TABLE articles (
            id SERIAL PRIMARY KEY,
            url TEXT NOT NULL,
            headline TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        await this.client.queryArray`CREATE TABLE creators (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        await this.client.queryArray`CREATE TABLE article_edits (
            id SERIAL PRIMARY KEY,
            article_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            headline TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (article_id) REFERENCES articles (id),
            FOREIGN KEY (creator_id) REFERENCES creators (id)
        )`

        await this.client.queryArray`CREATE UNIQUE INDEX articles_url ON articles (url)`;
        await this.client.queryArray`CREATE UNIQUE INDEX creators_name ON creators (name)`;
        await this.client.queryArray`CREATE INDEX article_edits_article_id ON article_edits (article_id)`;
        await this.client.queryArray`CREATE INDEX article_edits_creator_id ON article_edits (creator_id)`;
    }

    /** Runs on rollback */
    async down(info: Info): Promise<void> {
        await this.client.queryArray`DROP TABLE article_edits`;
        await this.client.queryArray`DROP TABLE articles`;
        await this.client.queryArray`DROP TABLE creators`;
    }
}
