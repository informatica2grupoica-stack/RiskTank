import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RiskTank · Riesgo comercial por RUT",
  description: "Evalúa el riesgo de clientes y proveedores chilenos por RUT usando fuentes públicas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Risk<span className="text-accent">Tank</span>
            </Link>
            <nav className="text-sm text-muted flex gap-5">
              <Link href="/" className="hover:text-foreground">Buscar</Link>
              <Link href="/fuentes" className="hover:text-foreground">Fuentes</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        <footer className="border-t border-border text-xs text-muted">
          <div className="mx-auto max-w-5xl px-4 py-4">
            Información de fuentes públicas. No constituye asesoría legal ni financiera; verifique antes de decidir.
          </div>
        </footer>
      </body>
    </html>
  );
}
