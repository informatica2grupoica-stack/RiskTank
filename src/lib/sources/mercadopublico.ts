// API pública de Mercado Público (ChileCompra). Requiere un ticket gratuito:
// https://api.mercadopublico.cl/modules/Participa.aspx
import type Database from "better-sqlite3";
import { formatRut } from "../rut";

const BASE = "https://api.mercadopublico.cl/servicios/v1/publico";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MercadoPublicoResult =
  | { estado: "sin_ticket" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; registrado: boolean; codigoEmpresa?: string; nombre?: string; consultadoEn: string };

export async function consultarProveedor(db: Database.Database, rut: string): Promise<MercadoPublicoResult> {
  const ticket = process.env.MERCADOPUBLICO_TICKET;
  if (!ticket) return { estado: "sin_ticket" };

  const cached = db
    .prepare(`SELECT datos, creado_en FROM cache_externo WHERE fuente = 'mercadopublico' AND clave = ?`)
    .get(rut) as { datos: string; creado_en: string } | undefined;
  if (cached && Date.now() - Date.parse(cached.creado_en) < TTL_MS) return JSON.parse(cached.datos);

  try {
    const url = `${BASE}/empresas/BuscarProveedor?rutempresaproveedor=${encodeURIComponent(formatRut(rut))}&ticket=${ticket}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as {
      Codigo?: number;
      Mensaje?: string;
      listaEmpresas?: { CodigoEmpresa: string; NombreEmpresa: string }[];
    };
    if (json.Codigo && json.Codigo !== 200) return { estado: "error", mensaje: json.Mensaje ?? `Código ${json.Codigo}` };
    const empresa = json.listaEmpresas?.[0];
    const result: MercadoPublicoResult = {
      estado: "ok",
      registrado: Boolean(empresa),
      codigoEmpresa: empresa?.CodigoEmpresa,
      nombre: empresa?.NombreEmpresa,
      consultadoEn: new Date().toISOString(),
    };
    db.prepare(
      `INSERT OR REPLACE INTO cache_externo (fuente, clave, datos, creado_en) VALUES ('mercadopublico', ?, ?, ?)`,
    ).run(rut, JSON.stringify(result), result.consultadoEn);
    return result;
  } catch (e) {
    return { estado: "error", mensaje: e instanceof Error ? e.message : String(e) };
  }
}
