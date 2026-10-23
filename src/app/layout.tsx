import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fontes no repositório (subset latin, OFL): o build não depende do Google Fonts estar acessível.
const body = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});
const display = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  variable: "--font-display",
  weight: "600 800",
  display: "swap",
});
// Archivo (eixo de largura): letreiro da landing page.
const sign = localFont({
  src: "./fonts/archivo-latin.woff2",
  variable: "--font-sign",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "GereVendas Ads", template: "%s · GereVendas Ads" },
  description:
    "Crie anúncios para o seu negócio local com inteligência artificial. Você revisa, edita e aprova antes de publicar.",
};

export const viewport: Viewport = { themeColor: "#f6f5f1" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${body.variable} ${display.variable} ${sign.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
