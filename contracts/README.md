# contracts/

Dua saja, sesuai PLAN.md §4 (ditulis 25 Nov 2026, milestone hari-2):

- **MockUSDC** — ERC-20 6 desimal + EIP-3009 `transferWithAuthorization`,
  mint bebas. **Testnet saja — tidak pernah di-deploy ke mainnet.**
  Cadangan bila USDC HSP tidak tersedia saat demo; token utama testnet
  adalah USDC HSP `0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6`
  (RESEARCH.md §3, terverifikasi on-chain). Ditulis tanpa OpenZeppelin
  (tidak terpasang di repo) — minimal dan mudah dibaca.
- **ReceiptRegistry** — `recordReceipt(paymentId, payer, payee, token,
  amount, mandateHash, txHash, memo)` + event `ReceiptRecorded` + view
  `getReceipt` / `receiptsOfPayer` / `receiptsOfPayee` / `receiptText`.
  Tidak memegang dana, tidak punya owner. Kontrak ini yang di-deploy ke
  mainnet juga (1 Des, bila ada dana — lihat scripts/deploy-mainnet.cjs).

Skrip (semua `.cjs`, lihat komentar di tiap file soal kenapa bukan `.ts`):
- `scripts/test-contracts.cjs` — tes kontrak di jaringan Hardhat in-process
  (`npm run test:contracts`).
- `scripts/deploy-testnet.cjs` — deploy keduanya ke testnet 133
  (`npm run deploy:testnet`; butuh tHSK + DEPLOYER_PRIVATE_KEY).
- `scripts/deploy-mainnet.cjs` — placeholder; menolak deploy tanpa
  `SELESAI_MAINNET_CONFIRMED=yes` + yes Junes (PLAN.md §11.2).
