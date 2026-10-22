const REGIONES: Record<number, string> = {
  1: "Tarapacá", 2: "Antofagasta", 3: "Atacama", 4: "Coquimbo", 5: "Valparaíso",
  6: "O'Higgins", 7: "Maule", 8: "Biobío", 9: "La Araucanía", 10: "Los Lagos",
  11: "Aysén", 12: "Magallanes", 13: "Metropolitana", 14: "Los Ríos", 15: "Arica y Parinacota", 16: "Ñuble",
};

export function nombreRegion(n: number | null | undefined): string {
  return n == null ? "—" : (REGIONES[n] ?? `Región ${n}`);
}

/** "VALPARAISO" -> "Valparaiso" */
export function titleCase(s: string | null | undefined): string {
  return s ? s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : "—";
}
