// Descarga y carga el Registro de Empresas y Sociedades desde datos.gob.cl a Postgres.
// Uso: npm run ingest:res            (reutiliza descargas existentes)
//      npm run ingest:res -- --force (vuelve a descargar todo)

import "./lib/env";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { Prisma } from "../src/generated/prisma/client";
import { getDb, setFuenteEstado } from "../src/lib/db";
import { normalizeRut } from "../src/lib/rut";
import { DATA_DIR, download, parseCsvLine } from "./lib/download";

const CKAN = "https://datos.gob.cl/api/3/action/package_show?id=registro-de-empresas-y-sociedades";
const RAW_DIR = path.join(DATA_DIR, "raw", "res");
const BATCH = 5000;
const force = process.argv.includes("--force");

type Resource = { name: string; url: string; format: string };

// Los encabezados cambian levemente entre años; los comparamos normalizados.
const COLS = {
  rut: ["rut"],
  razon_social: ["razon social"],
  fecha_actuacion: ["fecha de actuacion (1era firma)", "fecha de actuacion"],
  fecha_aprobacion: ["fecha de aprobacion x sii", "fecha de aprobacion"],
  tipo_sociedad: ["codigo de sociedad", "tipo de sociedad"],
  tipo_actuacion: ["tipo de actuacion"],
  capital: ["capital"],
  region_tributaria: ["region tributaria"],
  comuna_social: ["comuna social"],
  region_social: ["region social"],
} as const;

const normHeader = (h: string) =>
  h.replace(/^﻿/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "31-08-2026" -> Date(2026-08-31) */
function parseDate(s: string): Date | null {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

const toInt = (s: string) => {
  const n = Number(s.replace(/[^\d-]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

async function listResources(): Promise<Resource[]> {
  const res = await fetch(CKAN);
  if (!res.ok) throw new Error(`CKAN respondió ${res.status}`);
  const json = (await res.json()) as { result: { resources: Resource[] } };
  return json.result.resources.filter((r) => r.format.toLowerCase() === "csv");
}

async function main() {
  const db = getDb();
  const resources = await listResources();
  console.log(`RES: ${resources.length} archivos CSV en datos.gob.cl`);

  // Mantener el índice GIN durante 1,6 M de inserciones es muy lento; se recrea al final.
  await db.$executeRawUnsafe(`DROP INDEX IF EXISTS res_registro_nombre_fts`);

  for (const r of resources) {
    const file = path.basename(new URL(r.url).pathname);
    const lote = Number(/^(\d{4})/.exec(file)?.[1]);
    if (!lote) throw new Error(`No se pudo deducir el año de ${file}`);
    const dest = path.join(RAW_DIR, file);
    process.stdout.write(`  ${file} ... `);
    await download(r.url, dest, force);

    // Borrar antes de abrir el archivo: readline empieza a emitir líneas apenas se crea,
    // y las que salen antes de iterar con for await se pierden.
    await db.resRegistro.deleteMany({ where: { lote } });
    const rl = readline.createInterface({ input: fs.createReadStream(dest, "utf8"), crlfDelay: Infinity });
    let idx: Record<keyof typeof COLS, number> | null = null;
    let sep = ";";
    let ok = 0;
    let skipped = 0;
    let batch: Prisma.ResRegistroCreateManyInput[] = [];

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (!idx) {
        sep = line.split(";").length >= line.split(",").length ? ";" : ",";
        const headers = parseCsvLine(line, sep).map(normHeader);
        idx = Object.fromEntries(
          Object.entries(COLS).map(([k, names]) => [k, headers.findIndex((h) => (names as readonly string[]).includes(h))]),
        ) as Record<keyof typeof COLS, number>;
        if (idx.rut < 0 || idx.razon_social < 0) throw new Error(`Encabezado inesperado en ${file}: ${headers.join(" | ")}`);
        continue;
      }
      const f = parseCsvLine(line, sep);
      const get = (k: keyof typeof COLS) => (idx![k] >= 0 ? (f[idx![k]] ?? "") : "");
      const rut = normalizeRut(get("rut"));
      const razon = get("razon_social");
      if (!rut || !razon) {
        skipped++;
        continue;
      }
      const capital = toInt(get("capital"));
      batch.push({
        rut,
        razonSocial: razon,
        fechaActuacion: parseDate(get("fecha_actuacion")),
        fechaAprobacion: parseDate(get("fecha_aprobacion")),
        tipoSociedad: get("tipo_sociedad").slice(0, 8) || null,
        tipoActuacion: get("tipo_actuacion").toUpperCase().slice(0, 24) || null,
        capital: capital == null ? null : BigInt(capital),
        comunaSocial: get("comuna_social").slice(0, 40) || null,
        regionSocial: toInt(get("region_social")),
        regionTributaria: toInt(get("region_tributaria")),
        lote,
      });
      ok++;
      if (batch.length >= BATCH) {
        await db.resRegistro.createMany({ data: batch, skipDuplicates: true });
        batch = [];
      }
    }
    if (batch.length) await db.resRegistro.createMany({ data: batch, skipDuplicates: true });
    console.log(`${ok.toLocaleString("es-CL")} filas${skipped ? ` (${skipped} descartadas)` : ""}`);
  }

  console.log("Creando índice de búsqueda por nombre...");
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS res_registro_nombre_fts ON res_registro USING GIN (to_tsvector('simple', public.f_unaccent(razon_social)))`,
  );
  await db.$executeRawUnsafe(`ANALYZE res_registro`);

  const total = await db.resRegistro.count();
  await setFuenteEstado(db, {
    fuente: "res",
    nombre: "Registro de Empresas y Sociedades",
    url: "https://datos.gob.cl/dataset/registro-de-empresas-y-sociedades",
    registros: total,
  });
  console.log(`Listo: ${total.toLocaleString("es-CL")} actuaciones.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
