import actividades from "@/data/sii-actividades.json";
import subtipos from "@/data/sii-subtipos.json";
import { titleCase } from "@/lib/regiones";
import { tramoVentas, type ResultadoSii } from "@/lib/sii";

const ACT = actividades as Record<string, string>;
const SUB = subtipos as Record<string, { subtipo: string; tipo: string }>;

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL") : "—";

/** "XIII REGION METROPOLITANA" -> "Metropolitana" */
const region = (r: string | undefined) => titleCase(r?.replace(/^[IVXL]+\s+REGION\s+(DE\s+|DEL\s+)?/i, ""));

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export function FichaSiiCard({ sii }: { sii: ResultadoSii }) {
  if (sii.estado !== "ok" || !sii.ficha) {
    return (
      <section className="rounded-xl border border-border bg-surface">
        <h2 className="px-5 py-4 border-b border-border font-medium">Ficha tributaria (SII)</h2>
        <p className="px-5 py-4 text-sm text-muted">
          {sii.estado === "no_configurado"
            ? "Fuente no configurada."
            : sii.estado === "error"
              ? `No se pudo consultar: ${sii.mensaje}`
              : "No aparece en las nóminas de personas jurídicas del SII (puede ser persona natural)."}
        </p>
      </section>
    );
  }

  const f = sii.ficha;
  const e = f.e;
  const tramo = tramoVentas(e?.tv);
  const tramoPrevio = tramoVentas(f.e0?.tv);
  const sub = f.st != null ? SUB[f.st] : undefined;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <h2 className="px-5 py-4 border-b border-border font-medium flex items-baseline justify-between gap-2">
        <span>Ficha tributaria (SII)</span>
        {f.tg ? (
          <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Término de giro</span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Vigente</span>
        )}
      </h2>
      <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm content-start">
          <Fila label="Razón social">{f.n}</Fila>
          <Fila label="Tipo">{sub ? titleCase(sub.subtipo) : "—"}</Fila>
          <Fila label="Inicio actividades">{fecha(f.ia)}</Fila>
          {f.tg && <Fila label="Término de giro">{fecha(f.tg)}{e?.ttg ? ` · ${titleCase(e.ttg)}` : ""}</Fila>}
          <Fila label="Domicilio">
            {f.d ? (
              <>
                {titleCase(f.d.c)}, {titleCase(f.d.co)}, {region(f.d.r)}
                {f.d.f && <span className="block text-xs text-muted">Registrado el {fecha(f.d.f)}</span>}
              </>
            ) : (
              "—"
            )}
          </Fila>
          <Fila label="Sucursales">{f.su ?? 0}</Fila>
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm content-start">
          <Fila label="Tamaño">
            {tramo ? (
              <>
                {tramo.tamano} <span className="text-muted">· {tramo.detalle}</span>
                {e && <span className="block text-xs text-muted">Año comercial {e.a}{tramoPrevio && f.e0?.tv !== e.tv ? ` (en ${f.e0!.a}: ${tramoPrevio.tamano.toLowerCase()})` : ""}</span>}
              </>
            ) : (
              "—"
            )}
          </Fila>
          <Fila label="Trabajadores">
            {e?.tr ?? "—"}
            {f.e0?.tr != null && e?.tr != null && f.e0.tr !== e.tr && <span className="text-muted"> (en {f.e0.a}: {f.e0.tr})</span>}
          </Fila>
          <Fila label="Rubro">{titleCase(e?.ru)}</Fila>
          <Fila label="Subrubro">{titleCase(e?.sr)}</Fila>
          <Fila label="Régimen">{e?.rg ? titleCase(e.rg).replace(/\((.*?)\)/, (m) => m.toUpperCase()) : "—"}</Fila>
        </dl>
      </div>
      {f.ac && f.ac.length > 0 && (
        <div className="border-t border-border px-5 py-4 space-y-2">
          <h3 className="text-sm font-medium">Actividades económicas (giros) vigentes</h3>
          <ul className="text-sm space-y-1.5">
            {f.ac.map(([codigo, desde, iva]) => (
              <li key={codigo} className="flex gap-3">
                <span className="font-mono text-xs text-muted pt-0.5 w-14 shrink-0">{codigo}</span>
                <span className="flex-1 min-w-0">
                  {titleCase(ACT[codigo] ?? "Actividad desconocida")}
                  <span className="text-muted text-xs"> · desde {fecha(desde)}{iva ? " · afecta a IVA" : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
