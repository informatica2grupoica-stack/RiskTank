import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Módulo nativo: se carga desde node_modules en el servidor, no se empaqueta.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
