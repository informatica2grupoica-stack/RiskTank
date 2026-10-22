// Login simple de un solo usuario: credenciales en variables de entorno y una cookie de
// sesión firmada con HMAC-SHA256. Usa Web Crypto para funcionar igual en proxy y en el servidor.

export const SESSION_COOKIE = "rt_session";
export const SESSION_TTL_S = 7 * 24 * 60 * 60;

/** Usuario y contraseña. Por defecto admin/admin: cámbialos con AUTH_USER y AUTH_PASSWORD. */
export function credenciales() {
  return { user: process.env.AUTH_USER || "admin", password: process.env.AUTH_PASSWORD || "admin" };
}

export function usaCredencialesPorDefecto() {
  return !process.env.AUTH_PASSWORD;
}

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Sin AUTH_SECRET se deriva una clave de datos que solo existen en el servidor; cambiar la
// contraseña invalida así las sesiones abiertas.
async function clave(): Promise<CryptoKey> {
  const { user, password } = credenciales();
  const base = process.env.AUTH_SECRET || `${user}:${password}:${process.env.DATABASE_URL ?? ""}`;
  return crypto.subtle.importKey("raw", enc.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function firmar(data: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await clave(), enc.encode(data)));
}

/** Compara en tiempo constante para no filtrar información por tiempos de respuesta. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function credencialesValidas(user: string, password: string): boolean {
  const c = credenciales();
  // Evaluar ambas comparaciones siempre (sin cortocircuito).
  const okUser = iguales(user, c.user);
  const okPass = iguales(password, c.password);
  return okUser && okPass;
}

export async function crearSesion(user: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${encodeURIComponent(user)}.${exp}`;
  return `${payload}.${await firmar(payload)}`;
}

/** Devuelve el usuario si la cookie es válida y no expiró. */
export async function verificarSesion(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [user, exp, sig] = partes;
  if (!iguales(sig, await firmar(`${user}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return decodeURIComponent(user);
}
