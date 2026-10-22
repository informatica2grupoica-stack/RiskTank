import { getDb } from "@/lib/db";
import { buscarPorNombre } from "@/lib/profile";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ error: "Parámetro q requerido (mín. 2 caracteres)" }, { status: 400 });
  return Response.json({ resultados: buscarPorNombre(getDb(), q, 50) });
}
