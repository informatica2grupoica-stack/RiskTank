// API pública de Mercado Público (ChileCompra). Requiere un ticket gratuito:
// https://api.mercadopublico.cl/modules/Participa.aspx
import type { Db } from "../db";
import { formatRut } from "../rut";

const BASE = "https://api.mercadopublico.cl/servicios/v1/publico";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MercadoPublicoResult =
  | { estado: "sin_ticket" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; registrado: boolean; codigoEmpresa?: string; nombre?: string; consultadoEn: string };

export async function consultarProveedor(db: Db, rut: string): Promise<MercadoPublicoResult> {
  const ticket = process.env.MERCADOPUBLICO_TICKET;
  if (!ticket) return { estado: "sin_ticket" };

  const key = { fuente_clave: { fuente: "mercadopublico", clave: rut } };
  const cached = await db.cacheExterno.findUnique({ where: key });
  if (cached && Date.now() - cached.creadoEn.getTime() < TTL_MS) return cached.datos as MercadoPublicoResult;

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
    const data = { datos: result, creadoEn: new Date() };
    await db.cacheExterno.upsert({
      where: key,
      create: { fuente: "mercadopublico", clave: rut, ...data },
      update: data,
    });
    return result;
  } catch (e) {
    return { estado: "error", mensaje: e instanceof Error ? e.message : String(e) };
  }
}
