-- CreateTable
CREATE TABLE "res_registro" (
    "id" SERIAL NOT NULL,
    "rut" VARCHAR(10) NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_norm" TEXT NOT NULL,
    "fecha_actuacion" DATE,
    "fecha_aprobacion" DATE,
    "tipo_sociedad" VARCHAR(8),
    "tipo_actuacion" VARCHAR(24),
    "capital" BIGINT,
    "comuna_social" VARCHAR(40),
    "region_social" SMALLINT,
    "region_tributaria" SMALLINT,
    "lote" SMALLINT NOT NULL,

    CONSTRAINT "res_registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sancion" (
    "id" SERIAL NOT NULL,
    "fuente" VARCHAR(10) NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_norm" TEXT NOT NULL,
    "es_alias" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT,
    "programa" TEXT,
    "observacion" TEXT,

    CONSTRAINT "sancion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuente_estado" (
    "fuente" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "registros" INTEGER NOT NULL,

    CONSTRAINT "fuente_estado_pkey" PRIMARY KEY ("fuente")
);

-- CreateTable
CREATE TABLE "cache_externo" (
    "fuente" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_externo_pkey" PRIMARY KEY ("fuente","clave")
);

-- CreateTable
CREATE TABLE "consulta" (
    "id" SERIAL NOT NULL,
    "rut" VARCHAR(10) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" SMALLINT,
    "nivel" VARCHAR(10) NOT NULL,
    "alertas" JSONB NOT NULL,

    CONSTRAINT "consulta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "res_registro_rut_idx" ON "res_registro"("rut");

-- CreateIndex
CREATE INDEX "sancion_fuente_idx" ON "sancion"("fuente");

-- CreateIndex
CREATE INDEX "consulta_rut_creado_en_idx" ON "consulta"("rut", "creado_en");

-- CreateIndex
CREATE INDEX "consulta_creado_en_idx" ON "consulta"("creado_en");


-- Búsqueda de texto completo (no expresable en schema.prisma).
-- nombre_norm ya viene en mayúsculas y sin tildes; 'simple' no aplica stemming.
CREATE INDEX "res_registro_nombre_fts" ON "res_registro" USING GIN (to_tsvector('simple', "nombre_norm"));
CREATE INDEX "sancion_nombre_fts" ON "sancion" USING GIN (to_tsvector('simple', "nombre_norm"));

-- Supabase expone el esquema public por su API REST (clave anon). Con RLS activo y sin
-- políticas, esa API no puede leer ni escribir; Prisma se conecta como postgres y no se ve afectado.
ALTER TABLE "res_registro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sancion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fuente_estado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cache_externo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consulta" ENABLE ROW LEVEL SECURITY;
