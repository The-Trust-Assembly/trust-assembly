import { AbstractMigration, Info, ClientPostgreSQL } from "https://deno.land/x/nessie@2.0.11/mod.ts";

export default class extends AbstractMigration<ClientPostgreSQL> {
    /** Runs on migrate */
    async up(_info: Info): Promise<void> {
        await this.client.queryArray`CREATE TABLE identity_providers (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL,
            remote_id VARCHAR(255) NOT NULL,
            provider_type VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`;
        await this.client.queryArray`CREATE INDEX identity_providers_user_id ON identity_providers (user_id)`;
        await this.client.queryArray`CREATE INDEX identity_providers_remote_id ON identity_providers (remote_id)`;
    }

    /** Runs on rollback */
    async down(_info: Info): Promise<void> {
        await this.client.queryArray`DROP TABLE IF EXISTS identity_providers`;
    }
}
