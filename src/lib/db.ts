import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.RISKTANK_DATA_DIR ?? "data");
export const DB_PATH = path.join(DATA_DIR, "risktank.db");

const SCHEMA = `
-- Registro de Empresas y Sociedades (Ley 20.659), una fila por actuación.
CREATE TABLE IF NOT EXISTS res_registro (
  id                  INTEGER PRIMARY KEY,
  rut                 TEXT NOT NULL,
  razon_social        TEXT NOT NULL,
  fecha_actuacion     TEXT,
  fecha_registro      TEXT,
  fecha_aprobacion    TEXT,
  tipo_sociedad       TEXT,
  tipo_actuacion      TEXT,
  capital             INTEGER,
  comuna_tributaria   TEXT,
  region_tributaria   INTEGER,
  comuna_social       TEXT,
  region_social       INTEGER,
  archivo             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS res_registro_rut ON res_registro(rut);
CREATE INDEX IF NOT EXISTS res_registro_archivo ON res_registro(archivo);

-- Índice de búsqueda por nombre: una fila por RUT con su razón social más reciente.
CREATE VIRTUAL TABLE IF NOT EXISTS empresa_fts USING fts5(
  rut UNINDEXED, razon_social, tokenize = 'unicode61 remove_diacritics 2'
);

-- Listas de sanciones (OFAC SDN y alias, por ahora).
CREATE TABLE IF NOT EXISTS sancion (
  id          INTEGER PRIMARY KEY,
  fuente      TEXT NOT NULL,
  entidad_id  TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  nombre_norm TEXT NOT NULL,
  es_alias    INTEGER NOT NULL DEFAULT 0,
  tipo        TEXT,
  programa    TEXT,
  observacion TEXT
);
CREATE INDEX IF NOT EXISTS sancion_norm ON sancion(nombre_norm);
CREATE VIRTUAL TABLE IF NOT EXISTS sancion_fts USING fts5(
  nombre_norm, content = 'sancion', content_rowid = 'id'
);

-- Estado de cada fuente: cuándo se actualizó y cuántos registros tiene.
CREATE TABLE IF NOT EXISTS fuente_estado (
  fuente         TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  url            TEXT,
  actualizado_en TEXT NOT NULL,
  registros      INTEGER NOT NULL
);

-- Caché de consultas en línea (Mercado Público).
CREATE TABLE IF NOT EXISTS cache_externo (
  fuente     TEXT NOT NULL,
  clave      TEXT NOT NULL,
  datos      TEXT NOT NULL,
  creado_en  TEXT NOT NULL,
  PRIMARY KEY (fuente, clave)
);

-- Historial de evaluaciones, para ver la evolución del score.
CREATE TABLE IF NOT EXISTS consulta (
  id        INTEGER PRIMARY KEY,
  rut       TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  score     INTEGER,
  nivel     TEXT NOT NULL,
  alertas   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consulta_rut ON consulta(rut, creado_en);
`;

export function openDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec(SCHEMA);
  return db;
}

// En desarrollo Next recarga módulos; guardamos la conexión en globalThis.
const g = globalThis as unknown as { __risktankDb?: Database.Database };

export function getDb(): Database.Database {
  g.__risktankDb ??= openDb();
  return g.__risktankDb;
}

export function setFuenteEstado(
  db: Database.Database,
  e: { fuente: string; nombre: string; url?: string; registros: number },
) {
  db.prepare(
    `INSERT INTO fuente_estado (fuente, nombre, url, actualizado_en, registros)
     VALUES (@fuente, @nombre, @url, @ahora, @registros)
     ON CONFLICT(fuente) DO UPDATE SET nombre = excluded.nombre, url = excluded.url,
       actualizado_en = excluded.actualizado_en, registros = excluded.registros`,
  ).run({ url: null, ...e, ahora: new Date().toISOString() });
}
