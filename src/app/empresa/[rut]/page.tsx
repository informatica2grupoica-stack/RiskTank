import { notFound, redirect } from "next/navigation";
import { FichaSiiCard } from "@/components/FichaSiiCard";
import { NIVEL, NivelBadge, ScoreRing, SEVERIDAD } from "@/components/risk-ui";
import { getDb } from "@/lib/db";
import { construirPerfil } from "@/lib/profile";
import { nombreRegion, titleCase } from "@/lib/regiones";
import { formatRut, normalizeRut } from "@/lib/rut";

export const dynamic = "force-dynamic";

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL") : "—";
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$${n.toLocaleString("es-CL")}`);

export async function generateMetadata({ params }: { params: Promise<{ rut: string }> }) {
  const rut = normalizeRut(decodeURIComponent((await params).rut));
  return { title: rut ? `${formatRut(rut)} · RiskTank` : "RiskTank" };
}

export default async function Empresa({ params }: { params: Promise<{ rut: string }> }) {
  const raw = decodeURIComponent((await params).rut);
  const rut = normalizeRut(raw);
  if (!rut) notFound();
  if (rut !== raw) redirect(`/empresa/${rut}`);

  const p = await construirPerfil(getDb(), rut);
  const ultima = p.actuaciones.at(-1);
  const constitucion = p.actuaciones.find((a) => a.tipo_actuacion?.startsWith("CONSTITU"));

  return (
    <div className="space-y-6">
      {/* Encabezado + score */}
      <section className="rounded-xl border border-border bg-surface p-6 flex flex-col sm:flex-row gap-6 sm:items-center">
        <ScoreRing score={p.score} nivel={p.nivel} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <NivelBadge nivel={p.nivel} />
            {ultima?.tipo_sociedad && <span className="text-xs text-muted border border-border rounded-full px-2 py-0.5">{ultima.tipo_sociedad}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{p.razonSocial ?? "Razón social no encontrada"}</h1>
          <p className="font-mono text-muted">{formatRut(p.rut)}</p>
          <p className="text-sm text-muted">
            {p.nivel === "sin_datos"
              ? p.esEmpresa
                ? "No encontramos este RUT en el SII ni en el Registro de Empresas. Revisa que el RUT sea correcto."
                : "Este RUT parece de persona natural. Por ahora solo se cruza contra listas de sanciones por nombre."
              : `Score calculado con ${p.alertas.length} señales. 0 = sin riesgo detectado, 100 = riesgo máximo.`}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alertas */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-surface">
          <h2 className="px-5 py-4 border-b border-border font-medium">Alertas</h2>
          {p.alertas.length === 0 ? (
            <p className="px-5 py-6 text-muted text-sm">Sin alertas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {p.alertas.map((a) => (
                <li key={a.codigo + a.detalle} className="px-5 py-4 flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERIDAD[a.severidad].dot}`} title={SEVERIDAD[a.severidad].label} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{a.titulo}</p>
                    <p className="text-sm text-muted break-words">{a.detalle}</p>
                  </div>
                  <span className="text-xs text-muted tabular-nums shrink-0">
                    {a.puntos > 0 ? `+${a.puntos}` : a.puntos < 0 ? a.puntos : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Datos clave */}
        <section className="rounded-xl border border-border bg-surface">
          <h2 className="px-5 py-4 border-b border-border font-medium">Registro de Empresas</h2>
          {p.actuaciones.length === 0 && (
            <p className="px-5 pt-4 text-xs text-muted">
              No está en el RES: solo incluye sociedades creadas por «Tu Empresa en un Día» desde 2013.
            </p>
          )}
          <dl className="px-5 py-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Constitución</dt><dd>{fecha(constitucion?.fecha_actuacion)}</dd>
            <dt className="text-muted">Aprobación SII</dt><dd>{fecha(constitucion?.fecha_aprobacion)}</dd>
            <dt className="text-muted">Capital</dt><dd>{pesos(ultima?.capital)}</dd>
            <dt className="text-muted">Comuna</dt><dd>{titleCase(ultima?.comuna_social)}</dd>
            <dt className="text-muted">Región</dt><dd>{nombreRegion(ultima?.region_social)}</dd>
            <dt className="text-muted">Mercado Público</dt>
            <dd>
              {p.mercadoPublico.estado === "sin_ticket"
                ? <span className="text-muted">No configurado</span>
                : p.mercadoPublico.estado === "error"
                  ? <span className="text-muted">Error: {p.mercadoPublico.mensaje}</span>
                  : p.mercadoPublico.registrado ? "Proveedor registrado" : "No registrado"}
            </dd>
          </dl>
        </section>
      </div>

      <FichaSiiCard sii={p.sii} />

      {/* Actuaciones */}
      {p.actuaciones.length > 0 && (
        <section className="rounded-xl border border-border bg-surface overflow-hidden">
          <h2 className="px-5 py-4 border-b border-border font-medium">Historial en el Registro de Empresas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-5 py-2 font-normal">Fecha</th>
                  <th className="px-5 py-2 font-normal">Actuación</th>
                  <th className="px-5 py-2 font-normal">Razón social</th>
                  <th className="px-5 py-2 font-normal text-right">Capital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.actuaciones.map((a, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2 whitespace-nowrap">{fecha(a.fecha_actuacion)}</td>
                    <td className="px-5 py-2">{titleCase(a.tipo_actuacion)}</td>
                    <td className="px-5 py-2">{a.razon_social}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{pesos(a.capital)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Evolución */}
      {p.historial.length > 1 && (
        <section className="rounded-xl border border-border bg-surface">
          <h2 className="px-5 py-4 border-b border-border font-medium">Evaluaciones anteriores</h2>
          <ul className="px-5 py-3 text-sm space-y-1">
            {p.historial.slice(1, 10).map((h) => (
              <li key={h.creado_en} className="flex gap-4">
                <span className="text-muted w-40">{new Date(h.creado_en).toLocaleString("es-CL")}</span>
                <span className="tabular-nums w-8">{h.score ?? "—"}</span>
                <span style={{ color: NIVEL[h.nivel].color }}>{NIVEL[h.nivel].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        Fuentes consultadas: {p.fuentes.map((f) => `${f.nombre} (act. ${fecha(f.actualizado_en)})`).join(" · ") || "ninguna cargada"}.
        {" "}Generado el {new Date(p.generadoEn).toLocaleString("es-CL")}. JSON: <a className="underline" href={`/api/empresa/${p.rut}`}>/api/empresa/{p.rut}</a>
      </p>
    </div>
  );
}
