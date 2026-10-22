// Utilidades para RUT chileno: limpieza, dígito verificador y formato.

/** Deja solo dígitos y K, en mayúscula. "76.123.456-k" -> "76123456K" */
export function cleanRut(input: string): string {
  return input.replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Calcula el dígito verificador (módulo 11) para el cuerpo numérico. */
export function computeDv(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return "0";
  if (res === 10) return "K";
  return String(res);
}

/** Devuelve el RUT normalizado "12345678-9" o null si es inválido. */
export function normalizeRut(input: string): string | null {
  const clean = cleanRut(input).replace(/^0+/, "");
  if (clean.length < 2 || clean.length > 9) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body) || /^0+$/.test(body)) return null;
  if (computeDv(body) !== dv) return null;
  return `${Number(body)}-${dv}`;
}

/** "12345678-9" -> "12.345.678-9" */
export function formatRut(rut: string): string {
  const [body, dv] = rut.split("-");
  return `${Number(body).toLocaleString("es-CL")}-${dv}`;
}

/** Heurística: los RUT de personas jurídicas suelen ser >= 50.000.000. */
export function isLikelyCompany(rut: string): boolean {
  return Number(rut.split("-")[0]) >= 50_000_000;
}
