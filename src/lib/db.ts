import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL (ver .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// En desarrollo Next recarga módulos; guardamos el cliente en globalThis para no abrir conexiones de más.
const g = globalThis as unknown as { __risktankDb?: PrismaClient };

export function getDb(): PrismaClient {
  g.__risktankDb ??= createClient();
  return g.__risktankDb;
}

export async function setFuenteEstado(
  db: PrismaClient,
  e: { fuente: string; nombre: string; url?: string; registros: number },
) {
  const data = { nombre: e.nombre, url: e.url ?? null, registros: e.registros, actualizadoEn: new Date() };
  await db.fuenteEstado.upsert({ where: { fuente: e.fuente }, create: { fuente: e.fuente, ...data }, update: data });
}
