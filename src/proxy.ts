import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verificarSesion } from "@/lib/auth";

// Todo requiere sesión excepto el login y los archivos estáticos.
export async function proxy(request: NextRequest) {
  const user = await verificarSesion(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
