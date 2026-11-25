import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SettleTable — Meja Settlement Antar-Agen di HSK Chain",
  description:
    "Dua agen AI bernegosiasi, menyepakati Payment Mandate, dan membayar lewat HSP Gateway — dengan receipt on-chain yang bisa dibaca manusia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
