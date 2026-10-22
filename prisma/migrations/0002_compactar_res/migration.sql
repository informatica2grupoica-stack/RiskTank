-- Compacta res_registro para caber en el plan gratuito de Supabase (500 MB):
-- el RUT pasa a ser la clave primaria (hay una fila por RUT) y se elimina nombre_norm,
-- que duplicaba la razón social. La búsqueda indexa razon_social sin tildes vía unaccent.
-- La tabla se vacía: hay que volver a correr `npm run ingest:res`.

TRUNCATE "res_registro";

DROP INDEX IF EXISTS "res_registro_nombre_fts";
DROP INDEX IF EXISTS "res_registro_rut_idx";
ALTER TABLE "res_registro" DROP CONSTRAINT "res_registro_pkey";
ALTER TABLE "res_registro" DROP COLUMN "id";
ALTER TABLE "res_registro" DROP COLUMN "nombre_norm";
ALTER TABLE "res_registro" ADD CONSTRAINT "res_registro_pkey" PRIMARY KEY ("rut");

-- unaccent() no es IMMUTABLE, así que no sirve directo en un índice; se envuelve en una función
-- que fija el diccionario. En Supabase las extensiones viven en el esquema "extensions".
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

CREATE INDEX "res_registro_nombre_fts" ON "res_registro"
  USING GIN (to_tsvector('simple', public.f_unaccent("razon_social")));
