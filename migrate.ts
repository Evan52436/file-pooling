import { Client } from "pg";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const envMap = Object.fromEntries(
  env.split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const idx = line.indexOf("=");
      return [line.substring(0, idx), line.substring(idx + 1)];
    })
);

const connectionString = envMap["DATABASE_URL"] || "";

async function migrate() {
  if (!connectionString) {
    console.error("No DATABASE_URL found");
    return;
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`ALTER TABLE files ADD COLUMN IF NOT EXISTS uploader_name TEXT;`);
    console.log("Added uploader_name column.");
    await client.query(`ALTER TABLE files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;`);
    console.log("Added expires_at column.");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    await client.end();
  }
}

migrate();
