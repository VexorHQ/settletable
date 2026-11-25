# src/lib/

Config + util murni (tidak ada logika bisnis, tidak ada kunci privat).

- `chains.ts` — **sudah ada**: data jaringan HSK testnet (133) + mainnet (177)
  dari chainid.network, plus helper CAIP-2. Kalau RPC/explorer berubah, ubah
  file ini + `tests/chains.test.ts`.
- `mandate.ts` — tipe EIP-712 + sign/verify dua format mandate (Cart Mandate
  "HashKey Merchant Cart" + HSP Protocol Mandate "HSP Payment Mandate"),
  validasi cap per transaksi + harian (`checkSpendCaps`, `SpendLedger`),
  util USDC 6 desimal. Unit test di `tests/mandate.test.ts`.
- Util lain (format USDC, validasi mandate, dsb.) ditambahkan saat implementasi,
  satu file per topik, bukan satu file raksasa.
