"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { crearSesion, credencialesValidas, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth";

/** Solo rutas internas, para que ?next= no sirva para redirigir a otro sitio. */
function destinoSeguro(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const user = String(form.get("user") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!credencialesValidas(user, password)) {
    // Pequeña pausa para frenar intentos por fuerza bruta.
    await new Promise((r) => setTimeout(r, 500));
    return { error: "Usuario o contraseña incorrectos" };
  }
  (await cookies()).set(SESSION_COOKIE, await crearSesion(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  redirect(destinoSeguro(form.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
