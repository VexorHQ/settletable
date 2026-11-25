# src/server/

Logika server SettleTable — tanpa database, state demo hidup di memori (lihat
`store.ts`). Hanya modul di sini yang boleh memegang kunci privat (dari `.env`
server). Tidak ada kunci yang dikirim ke browser.

## Status hari ke-3 (25 Nov) — alur bayar end-to-end, jalur fallback EIP-3009

- `terms.ts` — katalog jasa Sari + `cartForService` (harga item = harga yang
  disepakati, bukan katalog).
- `negotiate.ts` — state machine negosiasi: maks 3 putaran, tawaran bergantian
  (pembeli membuka), tolak di atas cap, terima hanya oleh pihak yang tidak
  menawar terakhir.
- `mandates.ts` — `buildCartMandate` / `createMandate` (tanda tangani + cek cap)
  / `verifyMandateForSettle` (kedaluwarsa → tanda tangan → dicabut → nonce
  dipakai → cap) / `MandateStore`.
- `settle.ts` — `executeSettle`: preflight verify → cek auth cocok dengan
  mandate → cek `exists(paymentId)` → baca nama token dari kontrak → pulihkan
  penandatangan auth → `transferWithAuthorization` oleh executor → `recordReceipt`
  → catat ledger → baca `receiptText`. Bila receipt/ledger gagal SETELAH
  transfer, lempar error keras — perlu rekonsiliasi manual.
- `receipts.ts` — baca receipt dari kontrak (tanpa kunci, tanpa tulis).
- `store.ts` — `SettleTableStore` (ledger + MandateStore + negosiasi) + `DEMO_CAPS`
  (0,50/transaksi, 5,00/hari) + config chain dari `.env` + executor.

## Route API (src/app/api/) — ditulis hari ke-3

- `GET /api/terms` — katalog jasa.
- `POST /api/negotiations` — action `start` / `offer` / `accept` / `reject`.
- `POST /api/mandates` — action `create` (mandate TANPA tanda tangan + domain
  + types, supaya client yang menandatangani) / `verify` / `revoke`.
- `POST /api/settle` — eksekusi; 503 bila `.env` belum lengkap.
- `GET /api/receipts?paymentId=…` / `?payer=…` / `?payee=…`.

## Belum ada (bukan hari ke-3)

- Adapter HSP (`hsp.ts`) — milestone hari ke-5. Punya satu interface —
  `verify(mandate)`, `settle(mandate)`, `supported()` — supaya ganti
  implementasi tidak merembet ke route lain.
- Halaman UI (`/` katalog, `/dashboard`, `/receipt/[id]`) — hari ke-4.
