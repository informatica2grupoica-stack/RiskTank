import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarRiesgo, type Actuacion } from "./risk";

const hoy = new Date("2026-10-22");
const constitucion = (fecha: string, extra: Partial<Actuacion> = {}): Actuacion => ({
  fecha_actuacion: fecha,
  tipo_actuacion: "CONSTITUCIÓN",
  tipo_sociedad: "SpA",
  capital: 1_000_000,
  razon_social: "Ejemplo SpA",
  region_tributaria: 13,
  region_social: 13,
  ...extra,
});

test("sin datos no inventa un score", () => {
  const r = evaluarRiesgo({ hoy, actuaciones: [], sanciones: [] });
  assert.equal(r.score, null);
  assert.equal(r.nivel, "sin_datos");
});

test("empresa antigua sin alertas queda en riesgo bajo", () => {
  const r = evaluarRiesgo({ hoy, actuaciones: [constitucion("2018-01-10")], sanciones: [] });
  assert.equal(r.nivel, "bajo");
  assert.ok(r.alertas.some((a) => a.codigo === "EMPRESA_ANTIGUA"));
});

test("empresa recién constituida con capital bajo sube el riesgo", () => {
  const r = evaluarRiesgo({ hoy, actuaciones: [constitucion("2026-09-01", { capital: 100_000 })], sanciones: [] });
  assert.equal(r.score, 20 + 25 + 8);
  assert.equal(r.nivel, "alto");
});

test("coincidencia exacta en sanciones es crítica y va primero", () => {
  const r = evaluarRiesgo({
    hoy,
    actuaciones: [constitucion("2018-01-10")],
    sanciones: [{ fuente: "ofac", nombre: "EJEMPLO SPA", programa: "SDNTK", tipo: null, exacta: true }],
  });
  assert.equal(r.nivel, "critico");
  assert.equal(r.alertas[0].codigo, "SANCION_EXACTA");
});
