import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg usa módulos de Node (net, tls): se carga desde node_modules en el servidor.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
