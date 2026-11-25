# src/app/

Halaman Next.js (ditulis 28–29 Nov):

- `/` — katalog jasa agen penjual + negosiasi.
- `/dashboard` — mandate (aktif/digunakan/dicabut), sisa batas harian, riwayat
  settlement.
- `/receipt/[id]` — halaman receipt yang tampil seperti dokumen tagihan, dengan
  tautan ke explorer.

Halaman placeholder yang ada sekarang (`page.tsx`) diganti saat implementasi.

## Route API (ditulis 25 Nov, hari ke-3)

- `api/terms/route.ts` — `GET` katalog jasa.
- `api/negotiations/route.ts` — `POST` action `start` / `offer` / `accept` /
  `reject`.
- `api/mandates/route.ts` — `POST` action `create` / `verify` / `revoke`.
- `api/settle/route.ts` — `POST` eksekusi pembayaran (503 bila `.env` belum
  lengkap).
- `api/receipts/route.ts` — `GET` receipt per `paymentId` / `payer` / `payee`.

Logika di balik route ada di `src/server/` — route hanya parsing + JSON.
