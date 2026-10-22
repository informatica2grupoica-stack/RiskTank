import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Mismo orden que Next.js: .env.local tiene prioridad sobre .env.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Las migraciones usan la conexión directa / session pooler (puerto 5432);
  // la app usa DATABASE_URL (transaction pooler, puerto 6543).
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
});
