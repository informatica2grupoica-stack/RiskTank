// Sube data/sii/v1/*.json.gz a un bucket público "sii" de Supabase Storage.
// Requiere SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en .env.local: solo se usa aquí,
// desde tu equipo; la app lee el bucket público y no necesita la clave.
// Uso: npm run upload:sii

import "./lib/env";
import fs from "node:fs";
import path from "node:path";
import { getDb, setFuenteEstado } from "../src/lib/db";
import { SII_VERSION, type ManifestSii } from "../src/lib/sii";
import { DATA_DIR } from "./lib/download";

const BUCKET = "sii";
const DIR = path.join(DATA_DIR, "sii", SII_VERSION);
const CONCURRENCIA = 12;

function proyectoUrl(): string {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, "");
  const ref = /postgres\.([a-z0-9]+):/.exec(process.env.DATABASE_URL ?? "")?.[1];
  if (!ref) throw new Error("No se pudo deducir el proyecto: define SUPABASE_URL");
  return `https://${ref}.supabase.co`;
}

async function main() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY en .env.local (Supabase → Project Settings → API Keys)");
  const url = proyectoUrl();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const crear = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!crear.ok && crear.status !== 409) {
    const body = await crear.text();
    if (!/already exists/i.test(body)) throw new Error(`No se pudo crear el bucket: ${crear.status} ${body}`);
  }

  const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".json.gz") || f === "manifest.json");
  if (archivos.length === 0) throw new Error(`No hay archivos en ${DIR}: corre primero npm run build:sii`);
  console.log(`Subiendo ${archivos.length} archivos a ${url} (bucket ${BUCKET}/${SII_VERSION})...`);

  let hechos = 0;
  const cola = [...archivos];
  async function trabajador() {
    for (let f = cola.shift(); f; f = cola.shift()) {
      const body = fs.readFileSync(path.join(DIR, f));
      for (let intento = 1; ; intento++) {
        const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${SII_VERSION}/${f}`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": f.endsWith(".gz") ? "application/gzip" : "application/json",
            "Cache-Control": "max-age=86400",
            "x-upsert": "true",
          },
          body,
        });
        if (res.ok) break;
        if (intento >= 3) throw new Error(`${f}: ${res.status} ${await res.text()}`);
        await new Promise((r) => setTimeout(r, 1000 * intento));
      }
      if (++hechos % 200 === 0) console.log(`  ${hechos}/${archivos.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as ManifestSii;
  const db = getDb();
  await setFuenteEstado(db, {
    fuente: "sii",
    nombre: `Nóminas de personas jurídicas SII (publicación ${manifest.publicacion})`,
    url: "https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html",
    registros: manifest.contribuyentes,
  });
  await db.$disconnect();
  console.log(`Listo: ${hechos} archivos. URL pública: ${url}/storage/v1/object/public/${BUCKET}/${SII_VERSION}/`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
