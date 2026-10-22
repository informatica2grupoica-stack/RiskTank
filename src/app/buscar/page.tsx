import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { getDb } from "@/lib/db";
import { buscarPorNombre } from "@/lib/profile";
import { cleanRut, formatRut, normalizeRut } from "@/lib/rut";

export const dynamic = "force-dynamic";

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  if (!q) redirect("/");

  const rut = normalizeRut(q);
  if (rut) redirect(`/empresa/${rut}`);

  // Parece un RUT (solo dígitos, puntos, guion y K) pero el dígito verificador no cuadra.
  const pareceRut = /^[\d.\s-]+[kK]?$/.test(q) && cleanRut(q).length >= 7;
  const resultados = pareceRut ? [] : buscarPorNombre(getDb(), q, 30);

  return (
    <div className="space-y-6">
      <SearchBox defaultValue={q} />
      {pareceRut ? (
        <p className="text-red-700 dark:text-red-400">El RUT «{q}» no es válido: revisa el dígito verificador.</p>
      ) : resultados.length === 0 ? (
        <p className="text-muted">No encontramos empresas con «{q}» en el Registro de Empresas y Sociedades.</p>
      ) : (
        <>
          <p className="text-sm text-muted">{resultados.length} resultados para «{q}»</p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {resultados.map((r) => (
              <li key={r.rut}>
                <Link href={`/empresa/${r.rut}`} className="flex items-center gap-4 px-4 py-3 hover:bg-background">
                  <span className="font-mono text-sm w-32 shrink-0">{formatRut(r.rut)}</span>
                  <span className="truncate">{r.razon_social}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
