import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDv, formatRut, normalizeRut } from "./rut";

test("calcula dígito verificador", () => {
  assert.equal(computeDv("78325555"), "3");
  assert.equal(computeDv("78325512"), "K");
});

test("normaliza RUT en distintos formatos", () => {
  assert.equal(normalizeRut("78.325.555-3"), "78325555-3");
  assert.equal(normalizeRut("783255553"), "78325555-3");
  assert.equal(normalizeRut("78325512-k"), "78325512-K");
  assert.equal(normalizeRut("078325555-3"), "78325555-3");
});

test("rechaza RUT inválidos", () => {
  assert.equal(normalizeRut("78325555-4"), null);
  assert.equal(normalizeRut("abc"), null);
  assert.equal(normalizeRut("0-0"), null);
});

test("formatea con puntos", () => {
  assert.equal(formatRut("78325555-3"), "78.325.555-3");
});
