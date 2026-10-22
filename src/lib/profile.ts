// Arma el perfil de riesgo de un RUT a partir de todas las fuentes disponibles.
import type { Db } from "./db";
import { evaluarRiesgo, type Actuacion, type Alerta, type CoincidenciaSancion, type Nivel } from "./risk";
import { consultarProveedor, type MercadoPublicoResult } from "./sources/mercadopublico";
import { consultarSii, type ResultadoSii } from "./sii";
import { nameKey, significantTokens, toTsQuery } from "./text";
import { isLikelyCompany } from "./rut";

export type ActuacionRes = Actuacion & {
  fecha_aprobacion: string | null;
  comuna_social: string | null;
};

export type Perfil = {
  rut: string;
  razonSocial: string | null;
  esEmpresa: boolean;
  actuaciones: ActuacionRes[];
  sanciones: CoincidenciaSancion[];
  mercadoPublico: MercadoPublicoResult;
  sii: ResultadoSii;
  score: number | null;
  nivel: Nivel;
  alertas: Alerta[];
  historial: { creado_en: string; score: number | null; nivel: Nivel }[];
  fuentes: { fuente: string; nombre: string; url: string | null; actualizado_en: string; registros: number }[];
  generadoEn: string;
};

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function buscarSanciones(db: Db, nombre: string): Promise<CoincidenciaSancion[]> {
  const key = nameKey(nombre);
  const tokens = significantTokens(nombre);
  const q = toTsQuery(tokens.join(" "), false);
  if (!q) return [];
  const rows = await db.$queryRaw<
    { fuente: string; entidad_id: string; nombre: string; programa: string | null; tipo: string | null }[]
  >`SELECT fuente, entidad_id, nombre, programa, tipo FROM sancion
    WHERE to_tsvector('simple', nombre_norm) @@ to_tsquery('simple', ${q}) LIMIT 50`;

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

export async function construirPerfil(db: Db, rut: string): Promise<Perfil> {
  const [registros, mercadoPublico, sii] = await Promise.all([
    db.resRegistro.findMany({ where: { rut }, orderBy: { fechaActuacion: "asc" } }),
    consultarProveedor(db, rut),
    consultarSii(rut),
  ]);
  const fichaSii = sii.estado === "ok" ? sii.ficha : null;
  const actuaciones: ActuacionRes[] = registros.map((r) => ({
    razon_social: r.razonSocial,
    fecha_actuacion: isoDate(r.fechaActuacion),
    fecha_aprobacion: isoDate(r.fechaAprobacion),
    tipo_sociedad: r.tipoSociedad,
    tipo_actuacion: r.tipoActuacion,
    capital: r.capital == null ? null : Number(r.capital),
    comuna_social: r.comunaSocial,
    region_social: r.regionSocial,
    region_tributaria: r.regionTributaria,
  }));

  const nombreMp = mercadoPublico.estado === "ok" ? (mercadoPublico.nombre ?? null) : null;
  const razonSocial = actuaciones.at(-1)?.razon_social ?? fichaSii?.n ?? nombreMp;
  const sanciones = razonSocial ? await buscarSanciones(db, razonSocial) : [];

  const { score, nivel, alertas } = evaluarRiesgo({
    hoy: new Date(),
    actuaciones,
    sanciones,
    mercadoPublico: mercadoPublico.estado === "ok" ? mercadoPublico : null,
    sii: fichaSii,
  });

  const generado = await db.consulta.create({
    data: { rut, score, nivel, alertas: alertas.map((a) => a.codigo) },
  });

  const [historial, fuentes] = await Promise.all([
    db.consulta.findMany({ where: { rut }, orderBy: { creadoEn: "desc" }, take: 30 }),
    db.fuenteEstado.findMany({ orderBy: { fuente: "asc" } }),
  ]);

  return {
    rut,
    razonSocial,
    esEmpresa: isLikelyCompany(rut),
    actuaciones,
    sanciones,
    mercadoPublico,
    sii,
    score,
    nivel,
    alertas,
    historial: historial.map((h) => ({ creado_en: h.creadoEn.toISOString(), score: h.score, nivel: h.nivel as Nivel })),
    fuentes: fuentes.map((f) => ({
      fuente: f.fuente,
      nombre: f.nombre,
      url: f.url,
      actualizado_en: f.actualizadoEn.toISOString(),
      registros: f.registros,
    })),
    generadoEn: generado.creadoEn.toISOString(),
  };
}

export async function buscarPorNombre(db: Db, texto: string, limite = 20) {
  // Sin formas societarias ni artículos ("spa", "de"...): el índice tokeniza distinto la puntuación
  // y esas palabras solo restringen de más. Si no queda nada, se usa el texto completo.
  const q = toTsQuery(significantTokens(texto).join(" ")) ?? toTsQuery(texto);
  if (!q) return [];
  // Palabras comunes ("comercial") calzan con decenas de miles de filas: se toman hasta 1.000
  // candidatos del índice y se ordenan por largo (el nombre más corto es el que más se parece).
  return db.$queryRaw<{ rut: string; razon_social: string }[]>`
    SELECT rut, razon_social FROM (
      SELECT rut, razon_social FROM res_registro
      WHERE to_tsvector('simple', public.f_unaccent(razon_social)) @@ to_tsquery('simple', ${q})
      LIMIT 1000
    ) c
    ORDER BY length(razon_social), razon_social
    LIMIT ${limite}`;
}

export async function ultimasConsultas(db: Db, limite = 8) {
  const rows = await db.$queryRaw<
    { rut: string; score: number | null; nivel: Nivel; creado_en: Date; razon_social: string | null }[]
  >`
    SELECT c.rut, c.score, c.nivel, c.creado_en,
      (SELECT r.razon_social FROM res_registro r WHERE r.rut = c.rut
        ORDER BY r.fecha_actuacion DESC NULLS LAST LIMIT 1) AS razon_social
    FROM (
      SELECT DISTINCT ON (rut) rut, score, nivel, creado_en FROM consulta
      WHERE creado_en > now() - interval '90 days'
      ORDER BY rut, creado_en DESC
    ) c
    ORDER BY c.creado_en DESC LIMIT ${limite}`;
  return rows;
}
