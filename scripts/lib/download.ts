import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Carpeta para descargas (no se versiona). */
export const DATA_DIR = path.resolve(process.env.RISKTANK_DATA_DIR ?? "data");

/**
 * Descarga una URL a disco. Si el archivo ya existe y `force` es falso, lo reutiliza.
 * Escribe primero a un .part para no dejar archivos a medias.
 */
export async function download(url: string, dest: string, force = false): Promise<string> {
  if (!force && fs.existsSync(dest)) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  return dest;
}

/** Separa una línea CSV con comillas opcionales. */
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur === "") {
      quoted = true;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
