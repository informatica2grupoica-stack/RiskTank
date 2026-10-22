// Ficha tributaria del SII (nóminas públicas de personas jurídicas).
// Son ~3,4 millones de contribuyentes: no caben en la base gratuita, así que se publican como
// archivos JSON comprimidos repartidos por RUT en Supabase Storage (ver scripts/build-sii.ts).
import { gunzipSync } from "node:zlib";

export const SII_SHARDS = 2048;
export const SII_VERSION = "v1";

/** Claves cortas: se repiten 3,4 millones de veces en los archivos. */
export type FichaSii = {
  /** Razón social */
  n: string;
  /** Código de subtipo de contribuyente (ver SUBTIPOS) */
  st?: number;
  /** Inicio de actividades (YYYY-MM-DD) */
  ia?: string;
  /** Término de giro (YYYY-MM-DD) */
  tg?: string;
  /** Actividades económicas vigentes: [código, fecha, afecta a IVA (1/0), categoría tributaria] */
  ac?: [number, string | null, 0 | 1, number | null][];
  /** Domicilio vigente (casa matriz) */
  d?: { c: string; co: string; r: string; f?: string };
  /** Cambios de domicilio en los 24 meses previos a la publicación */
  dc?: number;
  /** Sucursales vigentes */
  su?: number;
  /** Datos de empresa del último año comercial publicado */
  e?: EmpresaSii;
  /** Mismo dato del año anterior, para ver tendencia */
  e0?: Pick<EmpresaSii, "a" | "tv" | "tr">;
};

export type EmpresaSii = {
  /** Año comercial */
  a: number;
  /** Tramo según ventas (1 = sin ventas … 13 = grande 4) */
  tv?: number;
  /** Trabajadores dependientes informados */
  tr?: number;
  /** Tipo de término de giro */
  ttg?: string;
  /** Régimen tributario */
  rg?: string;
  /** Tramo capital propio positivo / negativo */
  cp?: number;
  cn?: number;
  /** Rubro y subrubro económico */
  ru?: string;
  sr?: string;
};

export type ManifestSii = {
  version: string;
  generado: string;
  contribuyentes: number;
  shards: number;
  anioEmpresas: number;
  publicacion: string;
};

export function shardDe(rut: string): number {
  return Number(rut.split("-")[0]) % SII_SHARDS;
}

/** Tramos de venta del SII (en UF anuales). */
export function tramoVentas(tv: number | undefined): { tamano: string; detalle: string } | null {
  if (tv == null) return null;
  if (tv === 1) return { tamano: "Sin ventas", detalle: "Sin ventas o sin información" };
  if (tv <= 4) return { tamano: "Micro", detalle: `Micro ${tv - 1} (hasta 2.400 UF)` };
  if (tv <= 7) return { tamano: "Pequeña", detalle: `Pequeña ${tv - 4} (2.400 – 25.000 UF)` };
  if (tv <= 9) return { tamano: "Mediana", detalle: `Mediana ${tv - 7} (25.000 – 100.000 UF)` };
  return { tamano: "Grande", detalle: `Grande ${tv - 9} (más de 100.000 UF)` };
}

/** URL base pública del bucket. Se deduce del usuario de DATABASE_URL (postgres.<ref>). */
export function siiBaseUrl(): string | null {
  if (process.env.SII_BASE_URL) return process.env.SII_BASE_URL.replace(/\/$/, "");
  const ref = /postgres\.([a-z0-9]+):/.exec(process.env.DATABASE_URL ?? "")?.[1];
  return ref ? `https://${ref}.supabase.co/storage/v1/object/public/sii` : null;
}

// Caché en memoria de shards recientes (cada uno ~100 KB descomprimido en JSON).
const cache = new Map<number, Promise<Record<string, FichaSii>>>();
const CACHE_MAX = 64;

async function cargarShard(base: string, shard: number): Promise<Record<string, FichaSii>> {
  const res = await fetch(`${base}/${SII_VERSION}/${shard}.json.gz`, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86_400 },
  });
  if (res.status === 404 || res.status === 400) return {};
  if (!res.ok) throw new Error(`SII shard ${shard}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Supabase puede entregarlo ya descomprimido si el cliente negoció gzip.
  const json = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(json);
}

export type ResultadoSii =
  | { estado: "no_configurado" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; ficha: FichaSii | null };

export async function consultarSii(rut: string): Promise<ResultadoSii> {
  const base = siiBaseUrl();
  if (!base) return { estado: "no_configurado" };
  const shard = shardDe(rut);
  let p = cache.get(shard);
  if (!p) {
    p = cargarShard(base, shard);
    cache.set(shard, p);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    p.catch(() => cache.delete(shard));
  }
  try {
    return { estado: "ok", ficha: (await p)[rut] ?? null };
  } catch (e) {
    return { estado: "error", mensaje: e instanceof Error ? e.message : String(e) };
  }
}
