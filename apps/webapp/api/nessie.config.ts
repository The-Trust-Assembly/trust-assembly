import {
    ClientPostgreSQL,
    NessieConfig,
} from "https://deno.land/x/nessie@2.0.11/mod.ts";

const client = new ClientPostgreSQL({
    database: "trust_assembly",
    hostname: Deno.env.get("POSTGRES_HOST") || "localhost",
    port: 5432,
    user: Deno.env.get("POSTGRES_USER") || "postgres",
    password: Deno.env.get("POSTGRES_PASSWORD") || "password",
});

/** This is the final config object */
const config: NessieConfig = {
    client,
    migrationFolders: ["./db/migrations"],
    seedFolders: ["./db/seeds"],
};

export default config;
