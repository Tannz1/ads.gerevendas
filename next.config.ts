import type { NextConfig } from "next";

// Subcaminho de publicação, ex.: "/ads" para servir em gerevendas.com.br/ads. Vazio = raiz.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
if (basePath && !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(basePath)) {
  throw new Error(`NEXT_PUBLIC_BASE_PATH inválido: use algo como "/ads" (sem barra no final)`);
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  basePath: basePath || undefined,
  // Só em `next dev`: o Supabase local e os E2E usam 127.0.0.1, que o dev server bloqueia por padrão.
  allowedDevOrigins: ["127.0.0.1"],
  // Foto do cliente até 5 MB (checado na action) + folga do multipart. Padrão do Next: 1 MB.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Gera .next/standalone para a imagem Docker (ver Dockerfile).
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
