import { AbstractMigration, Info, ClientPostgreSQL } from "https://deno.land/x/nessie@2.0.11/mod.ts";

export default class extends AbstractMigration<ClientPostgreSQL> {
    async up(info: Info): Promise<void> {
        await this.client.queryArray`CREATE TABLE users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            display_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        await this.client.queryArray`CREATE UNIQUE INDEX users_email ON users (email)`;
    }

    async down(info: Info): Promise<void> {
        await this.client.queryArray`DROP TABLE users`;
    }
}