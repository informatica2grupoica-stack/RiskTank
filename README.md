# RiskTank

Evaluación de riesgo comercial por RUT para empresas chilenas, construida solo con fuentes públicas y gratuitas.
Ingresas un RUT o una razón social y obtienes una ficha con datos de la empresa, alertas y un score de riesgo de 0 a 100.

## Puesta en marcha

Base de datos: Postgres en [Supabase](https://supabase.com) (plan gratuito) con Prisma.

1. Crea un proyecto en Supabase y copia `.env.example` a `.env.local` con las cadenas de conexión (Project → Connect).
2. Instala, crea las tablas y carga los datos:

```bash
npm install
npm run db:migrate   # crea tablas, índices de texto completo y activa RLS
npm run ingest       # descarga las fuentes y las carga en Supabase (~20-40 min la primera vez)
npm run build:sii    # arma las fichas del SII (3,4 M de contribuyentes, ~190 MB comprimidos)
npm run upload:sii   # las sube al bucket público "sii" de Supabase Storage (requiere SUPABASE_SECRET_KEY)
npm run dev          # http://localhost:3000
```

### Deploy en Vercel

En Vercel → Settings → Environment Variables agrega `DATABASE_URL` (transaction pooler, puerto 6543) y,
opcionalmente, `MERCADOPUBLICO_TICKET`. El build corre `prisma generate` automáticamente (postinstall).
La carga de datos (`npm run ingest`) se ejecuta desde tu equipo, no en Vercel.

## Fuentes

| Fuente | Tipo | Qué aporta |
|---|---|---|
| Registro de Empresas y Sociedades (datos.gob.cl) | Descarga CSV, `npm run ingest:res` | Razón social, fecha de constitución, tipo de sociedad, capital, comuna. Solo sociedades creadas vía «Tu Empresa en un Día» desde 2013. |
| OFAC SDN + alias (EE.UU.) | Descarga CSV, `npm run ingest:sanciones` | Coincidencias de nombre con la lista de sanciones. |
| Lista consolidada del Consejo de Seguridad ONU | Descarga XML, `npm run ingest:sanciones` | Ídem. |
| Nóminas de personas jurídicas del SII | ZIP/TSV, `npm run build:sii` + `upload:sii` | Razón social, inicio de actividades, término de giro, giros, domicilio, sucursales, tramo de ventas, trabajadores, rubro, régimen. Se guardan como 2.048 archivos JSON comprimidos en Supabase Storage (no caben en la base gratuita). |
| Mercado Público (ChileCompra) | API en línea con caché de 7 días | Si el RUT está registrado como proveedor del Estado. Requiere `MERCADOPUBLICO_TICKET`. |

Vuelve a correr `npm run ingest` periódicamente para actualizar (el RES se publica mensualmente).

## Score de riesgo

Reglas determinísticas en [`src/lib/risk.ts`](src/lib/risk.ts). Base 20 puntos, cada alerta suma o resta:

| Alerta | Puntos |
|---|---|
| Nombre idéntico en lista de sanciones | +70 |
| Sociedad disuelta | +60 |
| Constituida hace < 6 meses / < 1 año | +25 / +12 |
| Coincidencia parcial en sanciones | +15 |
| ≥ 3 modificaciones en 12 meses | +10 |
| Capital < $500.000 | +8 |
| Cambio de razón social | +5 |
| Más de 3 años de antigüedad / proveedor del Estado | −5 / −5 |

Niveles: bajo < 30 ≤ medio < 50 ≤ alto < 75 ≤ crítico. Sin datos en ninguna fuente → «Sin datos» (no se inventa un score).

Señales del SII: término de giro (+60), sin ventas (+12), sin giros vigentes (+10), caída de 2+ tramos de ventas (+10),
capital propio negativo (+10), 3+ cambios de domicilio en 24 meses (+10), sin trabajadores (+4), empresa mediana o grande (−5).

## Acceso

Login de un usuario con `AUTH_USER` / `AUTH_PASSWORD` (por defecto **admin / admin**: cámbialos en Vercel).
La sesión es una cookie firmada (HMAC) que dura 7 días; `src/proxy.ts` protege todas las páginas y la API.

## API

- `GET /api/empresa/{rut}`: perfil completo en JSON.
- `GET /api/buscar?q=texto`: búsqueda por razón social.

## Estructura

```
scripts/            ingesta de fuentes (tsx)
prisma/             esquema y migraciones (índices GIN de texto completo, RLS)
src/lib/            rut, db (Prisma + pg), reglas de riesgo, perfil, fuentes en línea
src/app/            páginas (inicio, búsqueda, ficha, fuentes) y rutas API
data/               descargas de las fuentes (no se versiona)
```

## Pendiente

Monitoreo de cartera con alertas por cambios, red societaria, multas de la DT y Boletín Concursal (sin dataset abierto encontrado aún), búsqueda por nombre sobre todo el SII (hoy solo busca en el RES).
