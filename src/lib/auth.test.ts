import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSesion, credencialesValidas, verificarSesion } from "./auth";

test("credenciales por defecto admin/admin", () => {
  assert.equal(credencialesValidas("admin", "admin"), true);
  assert.equal(credencialesValidas("admin", "otra"), false);
  assert.equal(credencialesValidas("", ""), false);
});

test("la sesión firmada se verifica y no se puede alterar", async () => {
  const token = await crearSesion("admin");
  assert.equal(await verificarSesion(token), "admin");
  const [, exp, sig] = token.split(".");
  assert.equal(await verificarSesion(`otro.${exp}.${sig}`), null);
  assert.equal(await verificarSesion(`admin.${Number(exp) + 1000}.${sig}`), null);
  assert.equal(await verificarSesion("basura"), null);
});
