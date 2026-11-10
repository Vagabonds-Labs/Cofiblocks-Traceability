import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct connection (port 5432), not the pooler: use
// DIRECT_URL and, if missing, DATABASE_URL.
//
// This reads `process.env` instead of Prisma's `env()` because `env()` throws
// when the variable is missing, which broke `prisma generate` in the Docker
// build, where there is no database (and meant the DATABASE_URL fallback was
// never used). With neither set, Prisma uses the schema's `datasource` block.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { engine: "classic" as const, datasource: { url } } : {}),
});
