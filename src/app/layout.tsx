import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
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
    <html lang="pt-BR" className={`${body.variable} ${display.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
