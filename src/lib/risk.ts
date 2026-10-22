// Motor de reglas: convierte los datos recopilados en alertas y un score de riesgo 0–100
// (más alto = más riesgo). Es determinístico y cada punto queda explicado por una alerta.
import { tramoVentas, type FichaSii } from "./sii";

export type Severidad = "critica" | "alta" | "media" | "baja" | "info" | "positiva";
export type Nivel = "bajo" | "medio" | "alto" | "critico" | "sin_datos";

export type Alerta = {
  codigo: string;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  fuente: string;
  puntos: number;
};

export type Actuacion = {
  fecha_actuacion: string | null;
  tipo_actuacion: string | null;
  tipo_sociedad: string | null;
  capital: number | null;
  razon_social: string;
  region_tributaria: number | null;
  region_social: number | null;
};

export type CoincidenciaSancion = {
  fuente: string;
  nombre: string;
  programa: string | null;
  tipo: string | null;
  exacta: boolean;
};

export type RiskInput = {
  hoy: Date;
  actuaciones: Actuacion[]; // ordenadas de la más antigua a la más reciente
  sanciones: CoincidenciaSancion[];
  mercadoPublico?: { registrado: boolean } | null;
  sii?: FichaSii | null;
};

const DIA = 24 * 60 * 60 * 1000;
const fechaCl = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "fecha desconocida");

function mesesEntre(desde: string, hoy: Date) {
  return (hoy.getTime() - Date.parse(desde)) / (30.44 * DIA);
}

export function evaluarRiesgo(input: RiskInput): { score: number | null; nivel: Nivel; alertas: Alerta[] } {
  const alertas: Alerta[] = [];
  const { actuaciones, hoy } = input;

  for (const s of input.sanciones) {
    alertas.push(
      s.exacta
        ? {
            codigo: "SANCION_EXACTA",
            severidad: "critica",
            titulo: `Nombre coincide con lista de sanciones (${s.fuente.toUpperCase()})`,
            detalle: `“${s.nombre}”${s.programa ? ` · programa ${s.programa}` : ""}. Verifique identidad antes de operar.`,
            fuente: s.fuente,
            puntos: 70,
          }
        : {
            codigo: "SANCION_PARCIAL",
            severidad: "media",
            titulo: `Posible coincidencia parcial en lista de sanciones (${s.fuente.toUpperCase()})`,
            detalle: `“${s.nombre}”. Puede ser un homónimo; revise manualmente.`,
            fuente: s.fuente,
            puntos: 15,
          },
    );
  }

  const constitucion = actuaciones.find((a) => a.tipo_actuacion?.startsWith("CONSTITU"));
  const ultima = actuaciones.at(-1);
  const sii = input.sii;

  // Antigüedad: constitución en el RES o, si no está, inicio de actividades en el SII.
  const inicio = constitucion?.fecha_actuacion
    ? { fecha: constitucion.fecha_actuacion, texto: "Constituida", fuente: "res" }
    : sii?.ia
      ? { fecha: sii.ia, texto: "Inicio de actividades", fuente: "sii" }
      : null;
  if (inicio) {
    const meses = mesesEntre(inicio.fecha, hoy);
    if (meses < 6) {
      alertas.push({
        codigo: "EMPRESA_MUY_NUEVA",
        severidad: "alta",
        titulo: "Empresa con menos de 6 meses",
        detalle: `${inicio.texto} el ${fechaCl(inicio.fecha)}. Sin historial comercial suficiente.`,
        fuente: inicio.fuente,
        puntos: 25,
      });
    } else if (meses < 12) {
      alertas.push({
        codigo: "EMPRESA_NUEVA",
        severidad: "media",
        titulo: "Empresa con menos de 1 año",
        detalle: `${inicio.texto} el ${fechaCl(inicio.fecha)}.`,
        fuente: inicio.fuente,
        puntos: 12,
      });
    } else if (meses >= 36) {
      alertas.push({
        codigo: "EMPRESA_ANTIGUA",
        severidad: "positiva",
        titulo: "Más de 3 años de antigüedad",
        detalle: `${inicio.texto} el ${fechaCl(inicio.fecha)}.`,
        fuente: inicio.fuente,
        puntos: -5,
      });
    }
  }

  const disolucion = actuaciones.find((a) => /DISOLU|TERMINO|TÉRMINO/.test(a.tipo_actuacion ?? ""));
  if (disolucion) {
    alertas.push({
      codigo: "DISUELTA",
      severidad: "critica",
      titulo: "La sociedad registra disolución",
      detalle: `${disolucion.tipo_actuacion} el ${fechaCl(disolucion.fecha_actuacion)}.`,
      fuente: "res",
      puntos: 60,
    });
  }

  const capital = ultima?.capital ?? constitucion?.capital;
  if (capital != null && capital > 0 && capital < 500_000) {
    alertas.push({
      codigo: "CAPITAL_BAJO",
      severidad: "baja",
      titulo: "Capital declarado bajo",
      detalle: `Capital de $${capital.toLocaleString("es-CL")} CLP.`,
      fuente: "res",
      puntos: 8,
    });
  }

  const hace12m = new Date(hoy.getTime() - 365 * DIA).toISOString().slice(0, 10);
  const modsRecientes = actuaciones.filter(
    (a) => a.tipo_actuacion?.startsWith("MODIFIC") && (a.fecha_actuacion ?? "") >= hace12m,
  );
  if (modsRecientes.length >= 3) {
    alertas.push({
      codigo: "MODIFICACIONES_FRECUENTES",
      severidad: "media",
      titulo: "Modificaciones societarias frecuentes",
      detalle: `${modsRecientes.length} modificaciones en los últimos 12 meses.`,
      fuente: "res",
      puntos: 10,
    });
  }

  const nombres = new Set(actuaciones.map((a) => a.razon_social.trim().toUpperCase()));
  if (nombres.size > 1) {
    alertas.push({
      codigo: "CAMBIO_RAZON_SOCIAL",
      severidad: "baja",
      titulo: "Ha cambiado de razón social",
      detalle: `Nombres registrados: ${[...nombres].join(" → ")}.`,
      fuente: "res",
      puntos: 5,
    });
  }

  if (ultima && ultima.region_social != null && ultima.region_tributaria != null && ultima.region_social !== ultima.region_tributaria) {
    alertas.push({
      codigo: "DOMICILIO_DISTINTO",
      severidad: "info",
      titulo: "Domicilio social y tributario en regiones distintas",
      detalle: `Región social ${ultima.region_social}, región tributaria ${ultima.region_tributaria}.`,
      fuente: "res",
      puntos: 0,
    });
  }

  if (sii) alertas.push(...alertasSii(sii));

  if (input.mercadoPublico?.registrado) {
    alertas.push({
      codigo: "PROVEEDOR_ESTADO",
      severidad: "positiva",
      titulo: "Registrado como proveedor del Estado",
      detalle: "Aparece en Mercado Público (ChileCompra).",
      fuente: "mercadopublico",
      puntos: -5,
    });
  }

  const hayDatos =
    actuaciones.length > 0 || input.sanciones.length > 0 || Boolean(input.mercadoPublico?.registrado) || Boolean(sii);
  if (!hayDatos) return { score: null, nivel: "sin_datos", alertas };

  // Base 20: todo tercero parte con algo de riesgo hasta que se demuestre lo contrario.
  const score = Math.max(0, Math.min(100, 20 + alertas.reduce((s, a) => s + a.puntos, 0)));
  const nivel: Nivel = score >= 75 ? "critico" : score >= 50 ? "alto" : score >= 30 ? "medio" : "bajo";
  const orden: Severidad[] = ["critica", "alta", "media", "baja", "info", "positiva"];
  alertas.sort((a, b) => orden.indexOf(a.severidad) - orden.indexOf(b.severidad));
  return { score, nivel, alertas };
}

/** Señales de la ficha tributaria del SII. */
function alertasSii(sii: FichaSii): Alerta[] {
  const out: Alerta[] = [];
  const add = (a: Omit<Alerta, "fuente">) => out.push({ ...a, fuente: "sii" });

  if (sii.tg) {
    add({
      codigo: "TERMINO_GIRO",
      severidad: "critica",
      titulo: "Registra término de giro en el SII",
      detalle: `Término de giro el ${fechaCl(sii.tg)}${sii.e?.ttg ? ` (${sii.e.ttg.toLowerCase()})` : ""}. Ya no debería estar operando.`,
      puntos: 60,
    });
  } else if (!sii.ac?.length) {
    add({
      codigo: "SIN_ACTIVIDADES",
      severidad: "media",
      titulo: "Sin actividades económicas vigentes en el SII",
      detalle: "No tiene giros inscritos y vigentes.",
      puntos: 10,
    });
  }

  const e = sii.e;
  if (e?.tv === 1) {
    add({
      codigo: "SIN_VENTAS",
      severidad: "media",
      titulo: `Sin ventas declaradas en ${e.a}`,
      detalle: "Tramo de ventas «sin ventas o sin información» en la nómina del SII.",
      puntos: 12,
    });
  } else if (e?.tv != null && sii.e0?.tv != null && sii.e0.tv - e.tv >= 2) {
    add({
      codigo: "CAIDA_VENTAS",
      severidad: "media",
      titulo: "Caída fuerte en el tramo de ventas",
      detalle: `De ${tramoVentas(sii.e0.tv)?.detalle} en ${sii.e0.a} a ${tramoVentas(e.tv)?.detalle} en ${e.a}.`,
      puntos: 10,
    });
  }
  if (e?.tv != null && e.tv >= 8) {
    add({
      codigo: "EMPRESA_CONSOLIDADA",
      severidad: "positiva",
      titulo: `Empresa ${tramoVentas(e.tv)?.tamano.toLowerCase()} según ventas`,
      detalle: `${tramoVentas(e.tv)?.detalle} en ${e.a}.`,
      puntos: -5,
    });
  }
  if (e?.tr === 0 && (e.tv ?? 0) > 1) {
    add({
      codigo: "SIN_TRABAJADORES",
      severidad: "baja",
      titulo: "Sin trabajadores dependientes informados",
      detalle: `Año comercial ${e.a}.`,
      puntos: 4,
    });
  }
  if (e?.cn != null) {
    add({
      codigo: "CAPITAL_PROPIO_NEGATIVO",
      severidad: "media",
      titulo: "Capital propio tributario negativo",
      detalle: `Tramo ${e.cn} de capital propio negativo en ${e.a}: el patrimonio tributario no cubre sus deudas.`,
      puntos: 10,
    });
  }
  if ((sii.dc ?? 0) >= 2) {
    add({
      codigo: "DOMICILIO_INESTABLE",
      severidad: (sii.dc ?? 0) >= 3 ? "media" : "baja",
      titulo: "Cambios frecuentes de domicilio",
      detalle: `${sii.dc} cambios de domicilio tributario en los últimos 24 meses.`,
      puntos: (sii.dc ?? 0) >= 3 ? 10 : 4,
    });
  }
  return out;
}
