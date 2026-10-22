// Arma el perfil de riesgo de un RUT a partir de todas las fuentes disponibles.
import type Database from "better-sqlite3";
import { evaluarRiesgo, type Actuacion, type Alerta, type CoincidenciaSancion, type Nivel } from "./risk";
import { consultarProveedor, type MercadoPublicoResult } from "./sources/mercadopublico";
import { nameKey, significantTokens, toFtsQuery } from "./text";
import { isLikelyCompany } from "./rut";

export type ActuacionRes = Actuacion & {
  fecha_registro: string | null;
  fecha_aprobacion: string | null;
  comuna_tributaria: string | null;
  comuna_social: string | null;
};

export type Perfil = {
  rut: string;
  razonSocial: string | null;
  esEmpresa: boolean;
  actuaciones: ActuacionRes[];
  sanciones: CoincidenciaSancion[];
  mercadoPublico: MercadoPublicoResult;
  score: number | null;
  nivel: Nivel;
  alertas: Alerta[];
  historial: { creado_en: string; score: number | null; nivel: Nivel }[];
  fuentes: { fuente: string; nombre: string; url: string | null; actualizado_en: string; registros: number }[];
  generadoEn: string;
};

export function buscarSanciones(db: Database.Database, nombre: string): CoincidenciaSancion[] {
  const key = nameKey(nombre);
  const tokens = significantTokens(nombre);
  if (tokens.length === 0) return [];
  const q = tokens.map((t) => `"${t}"`).join(" ");
  const rows = db
    .prepare(
      `SELECT s.fuente, s.entidad_id, s.nombre, s.programa, s.tipo
       FROM sancion_fts f JOIN sancion s ON s.id = f.rowid
       WHERE sancion_fts MATCH ? LIMIT 50`,
    )
    .all(q) as { fuente: string; entidad_id: string; nombre: string; programa: string | null; tipo: string | null }[];

  const vistos = new Set<string>();
  const out: CoincidenciaSancion[] = [];
  for (const r of rows) {
    const exacta = nameKey(r.nombre) === key;
    // Con una sola palabra significativa, solo aceptamos coincidencia exacta (evita ruido).
    if (!exacta && tokens.length < 2) continue;
    const id = `${r.fuente}:${r.entidad_id}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push({ fuente: r.fuente, nombre: r.nombre, programa: r.programa, tipo: r.tipo, exacta });
  }
  return out.sort((a, b) => Number(b.exacta) - Number(a.exacta)).slice(0, 10);
}

export async function construirPerfil(db: Database.Database, rut: string): Promise<Perfil> {
  const actuaciones = db
    .prepare(
      `SELECT razon_social, fecha_actuacion, fecha_registro, fecha_aprobacion, tipo_sociedad, tipo_actuacion,
              capital, comuna_tributaria, region_tributaria, comuna_social, region_social
       FROM res_registro WHERE rut = ? ORDER BY fecha_actuacion, id`,
    )
    .all(rut) as ActuacionRes[];

  const razonSocial = actuaciones.at(-1)?.razon_social ?? null;
  const [sanciones, mercadoPublico] = await Promise.all([
    Promise.resolve(razonSocial ? buscarSanciones(db, razonSocial) : []),
    consultarProveedor(db, rut),
  ]);

  if (!razonSocial && mercadoPublico.estado === "ok" && mercadoPublico.nombre) {
    sanciones.push(...buscarSanciones(db, mercadoPublico.nombre));
  }

  const { score, nivel, alertas } = evaluarRiesgo({
    hoy: new Date(),
    actuaciones,
    sanciones,
    mercadoPublico: mercadoPublico.estado === "ok" ? mercadoPublico : null,
  });

  const generadoEn = new Date().toISOString();
  db.prepare(`INSERT INTO consulta (rut, creado_en, score, nivel, alertas) VALUES (?, ?, ?, ?, ?)`).run(
    rut,
    generadoEn,
    score,
    nivel,
    JSON.stringify(alertas.map((a) => a.codigo)),
  );

  const historial = db
    .prepare(`SELECT creado_en, score, nivel FROM consulta WHERE rut = ? ORDER BY creado_en DESC LIMIT 30`)
    .all(rut) as Perfil["historial"];
  const fuentes = db.prepare(`SELECT * FROM fuente_estado ORDER BY fuente`).all() as Perfil["fuentes"];

  return {
    rut,
    razonSocial: razonSocial ?? (mercadoPublico.estado === "ok" ? (mercadoPublico.nombre ?? null) : null),
    esEmpresa: isLikelyCompany(rut),
    actuaciones,
    sanciones,
    mercadoPublico,
    score,
    nivel,
    alertas,
    historial,
    fuentes,
    generadoEn,
  };
}

export function buscarPorNombre(db: Database.Database, texto: string, limite = 20) {
  const q = toFtsQuery(texto);
  if (!q) return [];
  return db
    .prepare(`SELECT rut, razon_social FROM empresa_fts WHERE empresa_fts MATCH ? ORDER BY rank LIMIT ?`)
    .all(q, limite) as { rut: string; razon_social: string }[];
}

export function ultimasConsultas(db: Database.Database, limite = 8) {
  return db
    .prepare(
      `SELECT c.rut, c.score, c.nivel, MAX(c.creado_en) AS creado_en,
              (SELECT razon_social FROM res_registro r WHERE r.rut = c.rut
                ORDER BY fecha_actuacion DESC LIMIT 1) AS razon_social
       FROM consulta c GROUP BY c.rut ORDER BY creado_en DESC LIMIT ?`,
    )
    .all(limite) as { rut: string; score: number | null; nivel: Nivel; creado_en: string; razon_social: string | null }[];
}
