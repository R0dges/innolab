import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is missing. Did you add it to your .env?");
}

export default defineConfig({
  schema: "../../packages/database/src/schema.ts",
  out: "../../packages/database/drizzle",
  dialect: "postgresql", // 'postgresql' | 'mysql' | 'sqlite'
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
});
