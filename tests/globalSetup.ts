import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const dbPath = fileURLToPath(new URL("../prisma/test.db", import.meta.url));

export async function setup() {
  if (existsSync(dbPath)) unlinkSync(dbPath);

  execSync("node_modules/.bin/prisma db push --skip-generate --accept-data-loss", {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
    stdio: "inherit",
  });
}

export async function teardown() {
  if (existsSync(dbPath)) unlinkSync(dbPath);
}
