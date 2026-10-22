// Normalización de nombres para comparar razones sociales y listas de sanciones.

const LEGAL_SUFFIXES = new Set([
  "SPA", "SA", "LTDA", "LIMITADA", "EIRL", "SRL", "CIA", "COMPANIA", "Y",
  "SOCIEDAD", "ANONIMA", "INC", "LLC", "LTD", "CORP", "CORPORATION", "CO",
  "DE", "LA", "EL", "LOS", "LAS", "DEL",
]);

/** Mayúsculas, sin tildes ni puntuación, espacios simples. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/&/g, " Y ")
    .replace(/\bS\.\s?A\.?/g, "SA")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras significativas (sin formas societarias ni artículos). */
export function significantTokens(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .filter((t) => t.length > 1 && !LEGAL_SUFFIXES.has(t));
}

/** Clave de comparación: tokens significativos en su orden. */
export function nameKey(name: string): string {
  return significantTokens(name).join(" ");
}

/** Convierte texto libre en una consulta FTS5 segura (prefijo en el último término). */
export function toFtsQuery(input: string): string | null {
  const tokens = normalizeName(input).split(" ").filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(" ");
}
