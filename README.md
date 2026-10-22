# RiskTank

Evaluación de riesgo comercial por RUT para empresas chilenas, construida solo con fuentes públicas y gratuitas.
Ingresas un RUT o una razón social y obtienes una ficha con datos de la empresa, alertas y un score de riesgo de 0 a 100.

## Puesta en marcha

```bash
npm install
npm run ingest      # descarga y carga las fuentes (~300 MB, unos minutos)
npm run dev         # http://localhost:3000
```

Opcional: copia `.env.example` a `.env.local` y agrega tu ticket de Mercado Público.

## Fuentes

| Fuente | Tipo | Qué aporta |
|---|---|---|
| Registro de Empresas y Sociedades (datos.gob.cl) | Descarga CSV, `npm run ingest:res` | Razón social, fecha de constitución, tipo de sociedad, capital, comuna. Solo sociedades creadas vía «Tu Empresa en un Día» desde 2013. |
| OFAC SDN + alias (EE.UU.) | Descarga CSV, `npm run ingest:sanciones` | Coincidencias de nombre con la lista de sanciones. |
| Lista consolidada del Consejo de Seguridad ONU | Descarga XML, `npm run ingest:sanciones` | Ídem. |
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

## API

- `GET /api/empresa/{rut}`: perfil completo en JSON.
- `GET /api/buscar?q=texto`: búsqueda por razón social.

## Estructura

```
scripts/            ingesta de fuentes (tsx)
src/lib/            rut, db (SQLite + FTS5), reglas de riesgo, perfil, fuentes en línea
src/app/            páginas (inicio, búsqueda, ficha, fuentes) y rutas API
data/               descargas y base risktank.db (no se versiona)
```

## Pendiente

Monitoreo de cartera con alertas por cambios, red societaria, multas de la DT y Boletín Concursal (sin dataset abierto encontrado aún), autenticación.
