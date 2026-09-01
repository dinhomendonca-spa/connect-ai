import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ConnectAI",
    template: "%s | ConnectAI",
  },

  description:
    "ConnectAI é uma plataforma inteligente para conectar pessoas, realizar reuniões, colaborar e transformar conversas em conteúdo.",

  applicationName: "ConnectAI",

  keywords: [
    "ConnectAI",
    "reuniões online",
    "inteligência artificial",
    "videoconferência",
    "networking",
    "criação de conteúdo",
  ],

  authors: [
    {
      name: "ConnectAI",
    },
  ],
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}