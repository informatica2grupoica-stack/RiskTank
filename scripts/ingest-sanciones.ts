// Descarga y carga listas de sanciones públicas: OFAC SDN (EE.UU.) y la lista consolidada de la ONU.
// Uso: npm run ingest:sanciones

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, openDb, setFuenteEstado } from "../src/lib/db";
import { normalizeName } from "../src/lib/text";
import { download, parseCsvLine } from "./lib/download";

const RAW_DIR = path.join(DATA_DIR, "raw", "sanciones");
const OFAC_SDN = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const OFAC_ALT = "https://www.treasury.gov/ofac/downloads/alt.csv";
const UN_XML = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";

type Row = {
  fuente: string;
  entidad_id: string;
  nombre: string;
  es_alias: number;
  tipo: string | null;
  programa: string | null;
  observacion: string | null;
};

const nul = (s: string | undefined) => (!s || s === "-0-" ? null : s);

function readOfac(sdnFile: string, altFile: string): Row[] {
  const rows: Row[] = [];
  const entities = new Map<string, Row>();
  for (const line of fs.readFileSync(sdnFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line, ",");
    if (!nul(f[1])) continue; // el archivo termina con un carácter de fin de archivo (0x1A)
    const row: Row = {
      fuente: "ofac",
      entidad_id: f[0],
      nombre: f[1],
      es_alias: 0,
      tipo: nul(f[2]) ?? "entity",
      programa: nul(f[3]),
      observacion: nul(f[11]),
    };
    entities.set(row.entidad_id, row);
    rows.push(row);
  }
  for (const line of fs.readFileSync(altFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line, ",");
    const parent = entities.get(f[0]);
    if (!parent || !nul(f[3])) continue;
    rows.push({ ...parent, nombre: f[3], es_alias: 1 });
  }
  return rows;
}

const tag = (xml: string, name: string) =>
  new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim() ?? "";
const tags = (xml: string, name: string) =>
  [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1].trim());
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function readUn(file: string): Row[] {
  const xml = fs.readFileSync(file, "utf8");
  const rows: Row[] = [];
  for (const [blockTag, aliasTag, tipo] of [
    ["INDIVIDUAL", "INDIVIDUAL_ALIAS", "individual"],
    ["ENTITY", "ENTITY_ALIAS", "entity"],
  ] as const) {
    for (const block of tags(xml, blockTag)) {
      const nombre = unescapeXml(
        ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"].map((t) => tag(block, t)).filter(Boolean).join(" "),
      );
      if (!nombre) continue;
      const base: Row = {
        fuente: "onu",
        entidad_id: tag(block, "REFERENCE_NUMBER") || tag(block, "DATAID"),
        nombre,
        es_alias: 0,
        tipo,
        programa: tag(block, "UN_LIST_TYPE") || null,
        observacion: unescapeXml(tag(block, "COMMENTS1")) || null,
      };
      rows.push(base);
      for (const alias of tags(block, aliasTag)) {
        const a = unescapeXml(tag(alias, "ALIAS_NAME"));
        if (a) rows.push({ ...base, nombre: a, es_alias: 1 });
      }
    }
  }
  return rows;
}

function load(db: ReturnType<typeof openDb>, fuente: string, rows: Row[]) {
  const insert = db.prepare(`
    INSERT INTO sancion (fuente, entidad_id, nombre, nombre_norm, es_alias, tipo, programa, observacion)
    VALUES (@fuente, @entidad_id, @nombre, @nombre_norm, @es_alias, @tipo, @programa, @observacion)`);
  db.transaction(() => {
    db.prepare(`DELETE FROM sancion WHERE fuente = ?`).run(fuente);
    for (const r of rows) insert.run({ ...r, nombre_norm: normalizeName(r.nombre) });
  })();
}

async function main() {
  const db = openDb();

  console.log("OFAC SDN...");
  const sdn = await download(OFAC_SDN, path.join(RAW_DIR, "ofac-sdn.csv"), true);
  const alt = await download(OFAC_ALT, path.join(RAW_DIR, "ofac-alt.csv"), true);
  const ofac = readOfac(sdn, alt);
  load(db, "ofac", ofac);
  setFuenteEstado(db, { fuente: "ofac", nombre: "OFAC SDN (EE.UU.)", url: "https://sanctionssearch.ofac.treas.gov/", registros: ofac.length });
  console.log(`  ${ofac.length.toLocaleString("es-CL")} nombres (incluye alias)`);

  console.log("ONU lista consolidada...");
  const unFile = await download(UN_XML, path.join(RAW_DIR, "onu-consolidada.xml"), true);
  const un = readUn(unFile);
  load(db, "onu", un);
  setFuenteEstado(db, { fuente: "onu", nombre: "Consejo de Seguridad ONU", url: "https://main.un.org/securitycouncil/es/content/un-sc-consolidated-list", registros: un.length });
  console.log(`  ${un.length.toLocaleString("es-CL")} nombres (incluye alias)`);

  db.exec(`INSERT INTO sancion_fts(sancion_fts) VALUES ('rebuild')`);
  db.close();
  console.log("Listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
