// Arma las fichas del SII a partir de sus nóminas públicas de personas jurídicas y las escribe
// como data/sii/v1/<shard>.json.gz (+ catálogos en src/data). Luego: npm run upload:sii
// Uso: npm run build:sii            (reutiliza los .zip descargados)
//      npm run build:sii -- --force (los vuelve a descargar)

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import yauzl from "yauzl";
import { normalizeRut } from "../src/lib/rut";
import { SII_SHARDS, SII_VERSION, shardDe, type EmpresaSii, type FichaSii, type ManifestSii } from "../src/lib/sii";
import { DATA_DIR, download } from "./lib/download";

const BASE = "https://www.sii.cl/estadisticas/nominas";
const RAW_DIR = path.join(DATA_DIR, "raw", "sii");
const OUT_DIR = path.join(DATA_DIR, "sii", SII_VERSION);
const CATALOG_DIR = path.resolve("src", "data");
const force = process.argv.includes("--force");

/** Abre un archivo dentro de un zip como stream. */
function abrirEnZip(zipPath: string, nombre: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== nombre) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => (e || !stream ? reject(e) : resolve(stream)));
      });
      zip.on("end", () => reject(new Error(`${nombre} no está en ${zipPath}`)));
      zip.readEntry();
    });
  });
}

/** Recorre un TSV dentro de un zip, entregando cada fila como arreglo de campos. */
async function* filasTsv(zipPath: string, nombre: string): AsyncGenerator<string[]> {
  const stream = await abrirEnZip(zipPath, nombre);
  // Los archivos del SII mezclan UTF-8 y Latin-1; se decide con el primer bloque.
  let decoder: TextDecoder | null = null;
  const texto = Readable.from(
    (async function* () {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        if (!decoder) {
          try {
            new TextDecoder("utf-8", { fatal: true }).decode(chunk.subarray(0, chunk.length - 4));
            decoder = new TextDecoder("utf-8");
          } catch {
            decoder = new TextDecoder("latin1");
          }
        }
        yield decoder.decode(chunk, { stream: true });
      }
    })(),
  );
  const rl = readline.createInterface({ input: texto, crlfDelay: Infinity });
  let primera = true;
  for await (const line of rl) {
    if (primera) {
      primera = false;
      continue; // encabezado
    }
    if (line) yield line.split("\t").map((s) => s.trim());
  }
}

const rutDe = (num: string, dv: string) => normalizeRut(`${num}-${dv}`);
/** "27-06-2025" | "2025-06-27" -> "2025-06-27" */
const fecha = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
};
const num = (s: string | undefined) => (s && /^-?\d+$/.test(s) ? Number(s) : undefined);
const progreso = (label: string, n: number) => {
  if (n % 500_000 === 0) console.log(`    ${label}: ${n.toLocaleString("es-CL")}`);
};

async function main() {
  const zips: Record<string, string> = {};
  for (const f of ["PUB_NOMBRES_PJ", "PUB_NOM_ACTECOS", "PUB_NOM_DIRECCIONES", "PUB_EMPRESAS_PJ_2020_A_2024"]) {
    process.stdout.write(`Descargando ${f}.zip ... `);
    zips[f] = await download(`${BASE}/${f}.zip`, path.join(RAW_DIR, `${f}.zip`), force);
    console.log("ok");
  }

  const fichas = new Map<string, FichaSii>();
  const subtipos: Record<string, { subtipo: string; tipo: string }> = {};
  const actividades: Record<string, string> = {};

  console.log("Razón social, subtipo e inicio de actividades...");
  let n = 0;
  for await (const f of filasTsv(zips.PUB_NOMBRES_PJ, "PUB_NOMBRES_PJ.txt")) {
    const rut = rutDe(f[0], f[1]);
    if (!rut || !f[3]) continue;
    const ficha: FichaSii = { n: f[3] };
    if (num(f[2])) ficha.st = num(f[2]);
    if (fecha(f[4])) ficha.ia = fecha(f[4]);
    if (fecha(f[5])) ficha.tg = fecha(f[5]);
    fichas.set(rut, ficha);
    progreso("contribuyentes", ++n);
  }
  for await (const f of filasTsv(zips.PUB_NOMBRES_PJ, "CODIGO_TIPO_SUBTIPO_.txt")) {
    if (f[0]) subtipos[f[0]] = { subtipo: f[1], tipo: f[2] };
  }

  console.log("Actividades económicas...");
  n = 0;
  for await (const f of filasTsv(zips.PUB_NOM_ACTECOS, "PUB_NOM_ACTECOS.txt")) {
    const ficha = fichas.get(rutDe(f[0], f[1]) ?? "");
    const codigo = num(f[2]);
    if (!ficha || codigo == null) continue;
    actividades[codigo] ??= f[3];
    (ficha.ac ??= []).push([codigo, fecha(f[4]) ?? null, f[5] === "S" ? 1 : 0, num(f[6]) ?? null]);
    progreso("actividades", ++n);
  }

  console.log("Domicilios...");
  // Fecha de publicación aproximada: la más reciente que aparezca en el archivo.
  let publicacion = "";
  const historial = new Map<string, string[]>();
  n = 0;
  for await (const f of filasTsv(zips.PUB_NOM_DIRECCIONES, "PUB_NOM_DOMICILIO.txt")) {
    const rut = rutDe(f[0], f[1]);
    const ficha = fichas.get(rut ?? "");
    if (!ficha || !rut) continue;
    const fd = fecha(f[3]);
    if (fd && fd > publicacion && fd <= new Date().toISOString().slice(0, 10)) publicacion = fd;
    if (fd) {
      const h = historial.get(rut);
      if (h) h.push(fd);
      else historial.set(rut, [fd]);
    }
    if (f[2] === "S" && (!ficha.d?.f || (fd ?? "") > ficha.d.f)) {
      const calle = [f[5], f[6], f[7] && `BL ${f[7]}`, f[8], f[9]].filter(Boolean).join(" ");
      ficha.d = { c: calle, co: f[11], r: f[12], ...(fd ? { f: fd } : {}) };
    }
    progreso("direcciones", ++n);
  }
  const corte = new Date(Date.parse(publicacion || new Date().toISOString()) - 730 * 86_400_000).toISOString().slice(0, 10);
  for (const [rut, fechas] of historial) {
    const ficha = fichas.get(rut)!;
    let cambios = fechas.filter((x) => x >= corte).length;
    if ((ficha.ia ?? "") >= corte && cambios > 0) cambios--; // el primer domicilio no es un cambio
    if (cambios > 0) ficha.dc = cambios;
  }
  historial.clear();

  console.log("Sucursales...");
  for await (const f of filasTsv(zips.PUB_NOM_DIRECCIONES, "PUB_NOM_SUCURSAL.txt")) {
    const ficha = fichas.get(rutDe(f[0], f[1]) ?? "");
    if (ficha && f[2] === "S") ficha.su = (ficha.su ?? 0) + 1;
  }

  // Nómina de empresas: últimos dos años comerciales publicados (tramo de ventas, trabajadores…).
  const archivos = await listarZip(zips.PUB_EMPRESAS_PJ_2020_A_2024);
  const anios = archivos.map((a) => Number(/(\d{4})\.txt$/.exec(a)?.[1])).filter(Boolean).sort();
  const [anioPrevio, anioUltimo] = anios.slice(-2);
  for (const anio of [anioPrevio, anioUltimo]) {
    console.log(`Empresas año comercial ${anio}...`);
    n = 0;
    for await (const f of filasTsv(zips.PUB_EMPRESAS_PJ_2020_A_2024, `PUB_EMPRESAS_PJ_${anio}.txt`)) {
      const rut = rutDe(f[1], f[2]);
      if (!rut) continue;
      let ficha = fichas.get(rut);
      if (!ficha) {
        ficha = { n: f[3] };
        fichas.set(rut, ficha);
      }
      if (anio === anioPrevio) {
        ficha.e0 = { a: anio, tv: num(f[4]), tr: num(f[5]) };
        continue;
      }
      const e: EmpresaSii = { a: anio };
      if (num(f[4]) != null) e.tv = num(f[4]);
      if (num(f[5]) != null) e.tr = num(f[5]);
      if (f[9]) e.ttg = f[9];
      if (f[21]) e.rg = f[21];
      if (num(f[12]) != null) e.cp = num(f[12]);
      if (num(f[13]) != null) e.cn = num(f[13]);
      if (f[14]) e.ru = f[14];
      if (f[15]) e.sr = f[15];
      ficha.e = e;
      progreso("empresas", ++n);
    }
  }

  console.log(`Escribiendo ${SII_SHARDS} archivos en ${OUT_DIR} ...`);
  const shards: Record<string, FichaSii>[] = Array.from({ length: SII_SHARDS }, () => ({}));
  for (const [rut, ficha] of fichas) shards[shardDe(rut)][rut] = ficha;
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let bytes = 0;
  shards.forEach((s, i) => {
    const gz = gzipSync(JSON.stringify(s), { level: 9 });
    bytes += gz.length;
    fs.writeFileSync(path.join(OUT_DIR, `${i}.json.gz`), gz);
  });
  const manifest: ManifestSii = {
    version: SII_VERSION,
    generado: new Date().toISOString(),
    contribuyentes: fichas.size,
    shards: SII_SHARDS,
    anioEmpresas: anioUltimo,
    publicacion,
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  const ordenado = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(path.join(CATALOG_DIR, "sii-actividades.json"), JSON.stringify(ordenado(actividades), null, 1));
  fs.writeFileSync(path.join(CATALOG_DIR, "sii-subtipos.json"), JSON.stringify(ordenado(subtipos), null, 1));

  console.log(
    `Listo: ${fichas.size.toLocaleString("es-CL")} contribuyentes, ${(bytes / 1024 / 1024).toFixed(1)} MB comprimidos ` +
      `(${(bytes / SII_SHARDS / 1024).toFixed(0)} KB por archivo). Publicación: ${publicacion}.`,
  );
}

function listarZip(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      const nombres: string[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        nombres.push(e.fileName);
        zip.readEntry();
      });
      zip.on("end", () => resolve(nombres));
      zip.readEntry();
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
