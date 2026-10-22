import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { NivelBadge } from "@/components/risk-ui";
import { getDb } from "@/lib/db";
import { ultimasConsultas } from "@/lib/profile";
import { formatRut } from "@/lib/rut";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDb();
  const [recientes, fuentes] = await Promise.all([ultimasConsultas(db), db.fuenteEstado.count()]);

  return (
    <div className="space-y-12">
      <section className="pt-8 space-y-5 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          ¿Ese cliente o proveedor es confiable?
        </h1>
        <p className="text-muted text-lg">
          Ingresa un RUT y obtén en segundos un perfil de riesgo con alertas, score y datos clave, a partir de fuentes públicas.
        </p>
        <SearchBox autoFocus />
        {fuentes === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Aún no hay datos cargados. Ejecuta <code className="font-mono">npm run ingest</code> para descargar las fuentes.
          </p>
        )}
      </section>

      {recientes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Consultas recientes</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {recientes.map((c) => (
              <li key={c.rut}>
                <Link href={`/empresa/${c.rut}`} className="flex items-center gap-4 px-4 py-3 hover:bg-background">
                  <span className="flex-1 min-w-0 sm:flex sm:gap-4">
                    <span className="block truncate sm:order-2 sm:flex-1">{c.razon_social ?? "Sin razón social"}</span>
                    <span className="block font-mono text-sm text-muted sm:order-1 sm:w-32 sm:shrink-0">{formatRut(c.rut)}</span>
                  </span>
                  <span className="text-sm text-muted tabular-nums">{c.score ?? "—"}</span>
                  <NivelBadge nivel={c.nivel} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
