# Selesai — Meja Settlement Antar-Agen di HSK Chain

**Status: riset + rencana selesai, belum ada kode fitur.** Dokumen rencana ada di
[`PLAN.md`](PLAN.md), hasil riset di [`RESEARCH.md`](RESEARCH.md). Implementasi
mulai setelah rencana direview.

Selesai adalah proyek untuk **HSK Chain Horizon Hackathon · Seoul, Track 2 (Agent
Payments & A2A Settlement)**. Dua agen AI bernegosiasi harga, menyepakati
Payment Mandate yang ditandatangani wallet, membayar lewat HSP Gateway, dan
setiap pembayaran meninggalkan receipt on-chain yang bisa dibaca manusia.

- Deadline submit: **3 Des 2026 11:00 WIB**. Demo Day 5 Des, pemenang 6 Des.
- Hadiah Track 2: 1st 3.000 / 2nd 2.000 / 3rd 1.000 USDT.
- Builder: Vexor (solo).

## Menjalankan scaffold ini

```bash
npm install
npm run dev      # http://localhost:3000 (halaman placeholder)
npm test         # smoke test config jaringan
npx hardhat compile   # belum ada kontrak — compile kosong, normal
```

Salin `.env.example` ke `.env` dan isi seiring build berjalan. Jangan pernah
commit file `.env` atau kunci privat apa pun.

## Struktur

```
contracts/        Kontrak (MockUSDC + ReceiptRegistry) — ditulis 27 Nov
src/app/          Halaman Next.js (katalog, dashboard, receipt)
src/server/       API routes: terms, mandates, settle, receipts + adapter HSP
src/lib/          Config + util (chains.ts sudah ada)
src/components/   Komponen dashboard
tests/            Vitest
docs/             Catatan harian build (1 file per hari)
```

## Aturan repo ini

- Jangan tulis kode fitur sebelum `PLAN.md` direview.
- Jangan deploy ke chain mana pun sebelum milestone hari-2 (27 Nov).
- Jangan join/submit di DoraHacks sebelum 3 Des — dan hanya setelah checklist
  di `PLAN.md` §10 tercentang.
- Yang belum jelas (dokumen HSP, USDC testnet, RPC live) tercatat di
  `RESEARCH.md` §7 — verifikasi dulu, jangan ditebak.
