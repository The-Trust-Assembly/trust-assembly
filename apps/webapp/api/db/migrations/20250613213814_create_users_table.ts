import { AbstractMigration, Info, ClientPostgreSQL } from "https://deno.land/x/nessie@2.0.11/mod.ts";

export default class extends AbstractMigration<ClientPostgreSQL> {
    async up(_info: Info): Promise<void> {
        await this.client.queryArray`CREATE TABLE users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            display_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
        await this.client.queryArray`CREATE UNIQUE INDEX users_email ON users (email)`;
        await this.client.queryArray`
            CREATE  FUNCTION update_updated_at_task()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = now();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `;
        await this.client.queryArray`
            CREATE TRIGGER update_user_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_task();
        `;
    }

    async down(_info: Info): Promise<void> {
        await this.client.queryArray`DROP TABLE IF EXISTS users`;
        await this.client.queryArray`DROP FUNCTION IF EXISTS update_updated_at_task()`;
    }
}