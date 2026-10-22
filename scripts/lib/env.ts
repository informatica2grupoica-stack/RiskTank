// Carga variables igual que Next.js (.env.local tiene prioridad). Importar antes que src/lib/db.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

// Las cargas masivas van por la conexión de sesión (puerto 5432) si está configurada.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
