// Descarga y carga el Registro de Empresas y Sociedades desde datos.gob.cl.
// Uso: npm run ingest:res            (reutiliza descargas existentes)
//      npm run ingest:res -- --force (vuelve a descargar todo)

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DATA_DIR, openDb, setFuenteEstado } from "../src/lib/db";
import { normalizeRut } from "../src/lib/rut";
import { download, parseCsvLine } from "./lib/download";

const CKAN = "https://datos.gob.cl/api/3/action/package_show?id=registro-de-empresas-y-sociedades";
const RAW_DIR = path.join(DATA_DIR, "raw", "res");
const force = process.argv.includes("--force");

type Resource = { name: string; url: string; format: string };

// Los encabezados cambian levemente entre años; los comparamos normalizados.
const COLS = {
  rut: ["rut"],
  razon_social: ["razon social"],
  fecha_actuacion: ["fecha de actuacion (1era firma)", "fecha de actuacion"],
  fecha_registro: ["fecha de registro (ultima firma)", "fecha de registro"],
  fecha_aprobacion: ["fecha de aprobacion x sii", "fecha de aprobacion"],
  tipo_sociedad: ["codigo de sociedad", "tipo de sociedad"],
  tipo_actuacion: ["tipo de actuacion"],
  capital: ["capital"],
  comuna_tributaria: ["comuna tributaria"],
  region_tributaria: ["region tributaria"],
  comuna_social: ["comuna social"],
  region_social: ["region social"],
} as const;

const normHeader = (h: string) =>
  h.replace(/^﻿/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "31-08-2026" -> "2026-08-31" */
function isoDate(s: string): string | null {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
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
  const db = openDb();
  const resources = await listResources();
  console.log(`RES: ${resources.length} archivos CSV en datos.gob.cl`);

  const insert = db.prepare(`
    INSERT INTO res_registro (rut, razon_social, fecha_actuacion, fecha_registro, fecha_aprobacion,
      tipo_sociedad, tipo_actuacion, capital, comuna_tributaria, region_tributaria,
      comuna_social, region_social, archivo)
    VALUES (@rut, @razon_social, @fecha_actuacion, @fecha_registro, @fecha_aprobacion,
      @tipo_sociedad, @tipo_actuacion, @capital, @comuna_tributaria, @region_tributaria,
      @comuna_social, @region_social, @archivo)`);
  const deleteFile = db.prepare(`DELETE FROM res_registro WHERE archivo = ?`);

  for (const r of resources) {
    const file = path.basename(new URL(r.url).pathname);
    const dest = path.join(RAW_DIR, file);
    process.stdout.write(`  ${file} ... `);
    await download(r.url, dest, force);

    const rl = readline.createInterface({ input: fs.createReadStream(dest, "utf8"), crlfDelay: Infinity });
    let idx: Record<keyof typeof COLS, number> | null = null;
    let sep = ";";
    let ok = 0;
    let skipped = 0;
    let batch: Record<string, unknown>[] = [];

    const flush = db.transaction((rows: Record<string, unknown>[]) => {
      for (const row of rows) insert.run(row);
    });
    db.transaction(() => deleteFile.run(file))();

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
      batch.push({
        rut,
        razon_social: razon,
        fecha_actuacion: isoDate(get("fecha_actuacion")),
        fecha_registro: isoDate(get("fecha_registro")),
        fecha_aprobacion: isoDate(get("fecha_aprobacion")),
        tipo_sociedad: get("tipo_sociedad") || null,
        tipo_actuacion: get("tipo_actuacion").toUpperCase() || null,
        capital: toInt(get("capital")),
        comuna_tributaria: get("comuna_tributaria") || null,
        region_tributaria: toInt(get("region_tributaria")),
        comuna_social: get("comuna_social") || null,
        region_social: toInt(get("region_social")),
        archivo: file,
      });
      ok++;
      if (batch.length >= 5000) {
        flush(batch);
        batch = [];
      }
    }
    flush(batch);
    console.log(`${ok.toLocaleString("es-CL")} filas${skipped ? ` (${skipped} descartadas)` : ""}`);
  }

  console.log("Reconstruyendo índice de búsqueda por nombre...");
  db.transaction(() => {
    db.exec(`DELETE FROM empresa_fts`);
    db.exec(`
      INSERT INTO empresa_fts (rut, razon_social)
      SELECT rut, razon_social FROM (
        SELECT rut, razon_social,
          ROW_NUMBER() OVER (PARTITION BY rut ORDER BY fecha_actuacion DESC, id DESC) AS n
        FROM res_registro
      ) WHERE n = 1`);
  })();
  db.exec(`INSERT INTO empresa_fts(empresa_fts) VALUES ('optimize')`);

  const total = (db.prepare(`SELECT COUNT(*) c FROM res_registro`).get() as { c: number }).c;
  const ruts = (db.prepare(`SELECT COUNT(*) c FROM empresa_fts`).get() as { c: number }).c;
  setFuenteEstado(db, {
    fuente: "res",
    nombre: "Registro de Empresas y Sociedades",
    url: "https://datos.gob.cl/dataset/registro-de-empresas-y-sociedades",
    registros: total,
  });
  console.log(`Listo: ${total.toLocaleString("es-CL")} actuaciones, ${ruts.toLocaleString("es-CL")} empresas.`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
