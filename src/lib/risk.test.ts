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

test("término de giro en el SII es crítico", () => {
  const r = evaluarRiesgo({ hoy, actuaciones: [], sanciones: [], sii: { n: "X SPA", ia: "2015-01-01", tg: "2025-03-01" } });
  assert.equal(r.alertas[0].codigo, "TERMINO_GIRO");
  assert.equal(r.nivel, "critico");
});

test("sin RES, la antigüedad sale del inicio de actividades del SII", () => {
  const r = evaluarRiesgo({
    hoy,
    actuaciones: [],
    sanciones: [],
    sii: { n: "X LTDA", ia: "1995-01-01", ac: [[461000, "1995-01-01", 1, 1]], e: { a: 2024, tv: 10, tr: 50 } },
  });
  const codigos = r.alertas.map((a) => a.codigo);
  assert.ok(codigos.includes("EMPRESA_ANTIGUA"));
  assert.ok(codigos.includes("EMPRESA_CONSOLIDADA"));
  assert.equal(r.nivel, "bajo");
});

test("sin ventas y caída de tramo no se duplican", () => {
  const r = evaluarRiesgo({
    hoy,
    actuaciones: [],
    sanciones: [],
    sii: { n: "X", ia: "2020-01-01", ac: [[1, null, 1, 1]], e: { a: 2024, tv: 1 }, e0: { a: 2023, tv: 6 } },
  });
  const codigos = r.alertas.map((a) => a.codigo);
  assert.ok(codigos.includes("SIN_VENTAS"));
  assert.ok(!codigos.includes("CAIDA_VENTAS"));
});

test("una empresa con término de giro no suma puntos por antigüedad", () => {
  const r = evaluarRiesgo({ hoy, actuaciones: [constitucion("2013-05-02")], sanciones: [], sii: { n: "X", tg: "2018-06-28" } });
  assert.ok(!r.alertas.some((a) => a.codigo === "EMPRESA_ANTIGUA"));
  assert.equal(r.score, 80);
});
