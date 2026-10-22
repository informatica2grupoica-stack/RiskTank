import type { Nivel, Severidad } from "@/lib/risk";

export const NIVEL: Record<Nivel, { label: string; color: string; badge: string }> = {
  bajo: { label: "Riesgo bajo", color: "#2e7d4f", badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  medio: { label: "Riesgo medio", color: "#b7791f", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  alto: { label: "Riesgo alto", color: "#c2410c", badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  critico: { label: "Riesgo crítico", color: "#b91c1c", badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  sin_datos: { label: "Sin datos", color: "#8a8a8a", badge: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
};

export const SEVERIDAD: Record<Severidad, { label: string; dot: string }> = {
  critica: { label: "Crítica", dot: "bg-red-600" },
  alta: { label: "Alta", dot: "bg-orange-600" },
  media: { label: "Media", dot: "bg-amber-500" },
  baja: { label: "Baja", dot: "bg-yellow-400" },
  info: { label: "Info", dot: "bg-sky-500" },
  positiva: { label: "Positiva", dot: "bg-green-600" },
};

export function NivelBadge({ nivel }: { nivel: Nivel }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${NIVEL[nivel].badge}`}>{NIVEL[nivel].label}</span>;
}

export function ScoreRing({ score, nivel }: { score: number | null; nivel: Nivel }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32" role="img" aria-label={`Score ${score ?? "sin datos"} de 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="12" />
      <circle
        cx="64" cy="64" r={r} fill="none" stroke={NIVEL[nivel].color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 64 64)"
      />
      <text x="64" y="62" textAnchor="middle" fontSize="30" fontWeight="600" fill="currentColor">{score ?? "—"}</text>
      <text x="64" y="84" textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.6">de 100</text>
    </svg>
  );
}
