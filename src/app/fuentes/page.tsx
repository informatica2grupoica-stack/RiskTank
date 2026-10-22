import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const PENDIENTES = [
  { nombre: "Mercado Público (ChileCompra)", nota: "En línea. Requiere ticket gratuito en MERCADOPUBLICO_TICKET." },
  { nombre: "Multas Dirección del Trabajo", nota: "Sin dataset abierto encontrado; pendiente." },
  { nombre: "Boletín Concursal", nota: "Sin dataset abierto encontrado; pendiente." },
  { nombre: "SII / Poder Judicial", nota: "Protegidos con captcha; no se automatizan." },
];

export default async function Fuentes() {
  const fuentes = await getDb().fuenteEstado.findMany({ orderBy: { fuente: "asc" } });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Fuentes de datos</h1>
      <section className="rounded-xl border border-border bg-surface divide-y divide-border">
        {fuentes.length === 0 && <p className="p-5 text-muted text-sm">Sin fuentes cargadas. Ejecuta <code>npm run ingest</code>.</p>}
        {fuentes.map((f) => (
          <div key={f.fuente} className="p-5 flex flex-wrap gap-x-6 gap-y-1 items-baseline">
            <span className="font-medium flex-1 min-w-48">
              {f.url ? <a href={f.url} className="hover:underline" target="_blank" rel="noreferrer">{f.nombre}</a> : f.nombre}
            </span>
            <span className="text-sm tabular-nums">{f.registros.toLocaleString("es-CL")} registros</span>
            <span className="text-sm text-muted">Actualizado {new Date(f.actualizadoEn).toLocaleString("es-CL")}</span>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Otras fuentes</h2>
        <ul className="text-sm space-y-1">
          {PENDIENTES.map((p) => (
            <li key={p.nombre}><span className="font-medium">{p.nombre}:</span> <span className="text-muted">{p.nota}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
