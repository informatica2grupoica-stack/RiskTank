import { getDb } from "@/lib/db";
import { construirPerfil } from "@/lib/profile";
import { normalizeRut } from "@/lib/rut";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ rut: string }> }) {
  const rut = normalizeRut(decodeURIComponent((await params).rut));
  if (!rut) return Response.json({ error: "RUT inválido" }, { status: 400 });
  return Response.json(await construirPerfil(getDb(), rut));
}
