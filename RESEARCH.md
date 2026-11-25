# Riset HSK Chain Horizon Hackathon — Track 2 (Agent Payments & A2A Settlement)

Ditulis 25 Nov 2026, 19:00 WIB. Semua angka di bawah diambil dari sumber resmi/publik yang
dikutip; yang belum terverifikasi ditulis apa adanya sebagai "belum jelas".

## 1. Kompetisi (DoraHacks)

- Halaman: https://dorahacks.io/hackathon/hskchainseoul/detail (dibaca 25 Nov, crawl 23 Nov)
- Total hadiah **12.000 USDT** (6.000/track; 1st 3.000 / 2nd 2.000 / 3rd 1.000).
- **Deadline submit: 3 Des 2026 13:00 KST = 11:00 WIB.** Demo Day 5 Des (Seoul, online
  boleh bila terpilih), pengumuman pemenang 6 Des, hadiah cair maks 14 hari kerja.
- Sudah ada **24 Builds / 115 Hackers** (per 25 Nov).
- Syarat yang mengikat:
  - Individu/tim dari negara mana pun boleh ikut; proyek orisinal, dibangun/dibangun
    ulang selama hackathon (20 Nov–3 Des).
  - Track pembayaran **wajib pakai HSP**. Produk/framework resmi yang direkomendasikan
    = poin bonus.
  - **Nuansa mainnet — baca baik-baik.** Halaman menulis dua kalimat yang saling
    melengkapi: "Winning teams must deploy their projects on HSK Chain mainnet to
    claim a prize" DAN "Deploy the project's smart contract on HSK Chain mainnet.
    Projects without a mainnet deployment automatically lose eligibility for demo
    selection." Artinya: submit tanpa mainnet itu boleh, tapi proyek itu **tidak
    bisa dipilih untuk demo dan tidak bisa menang**. Jadi untuk jalur hadiah, deploy
    mainnet praktis wajib — bukan sekadar "kalau terpilih". Ini koreksi terhadap
    asumsi awal bahwa mainnet hanya perlu saat menang.
  - Tim yang bisa pitch langsung di Seoul diprioritaskan untuk demo. Junes di Jakarta
    → jalur online; demo harus kuat di video + live demo yang bisa dibuka juri.
  - Penyelenggara tidak pernah meminta bayaran apa pun (peringatan anti-fraud di halaman).

## 2. HSK Chain — data jaringan (terverifikasi dari chainid.network + docs resmi)

|  | Testnet | Mainnet |
|---|---|---|
| Nama | HSKChain Testnet | HSKChain |
| Chain ID | **133** (0x85) | **177** (0xb1) |
| RPC publik | https://testnet.hsk.xyz | https://mainnet.hsk.xyz |
| Explorer | https://testnet-explorer.hskchain.net (Blockscout) | https://hsk.blockscout.com (Blockscout) |
| Token gas | HSK ("HashKey EcoPoints", 18 desimal) | HSK |
| Faucet di chainlist | tidak ada yang terdaftar | — |

- HSK Chain = **OP-Stack Layer 2, EVM-compatible** (HashKey Group, 3887.HK).
  RPC standar `eth_*`; ada method tambahan `hk_getComplianceStatus`.
- Explorer lain yang dipakai di lapangan: https://explorer.hsk.xyz (dipakai proyek
  AgentSettle untuk kontrak mainnet-nya) dan OKLink https://www.oklink.com/hashkey.
- **Faucet tHSK:** jalur yang terdokumentasi adalah **thirdweb universal EVM faucet**
  — 0,01 tHSK per klaim, dari halaman chain HashKey Testnet di thirdweb
  (blog.thirdweb.com, panduan faucet tHSK). Docs resmi juga menyebut "HSKChain
  Testnet Faucet" tanpa URL langsung yang berhasil ditemukan. Perlu dicoba langsung
  hari pertama: klaim 0,01 tHSK kemungkinan kecil untuk deploy + testing berulang,
  jadi siapkan klaim berkali-kali / beberapa alamat.
- **Status faucet 25 Nov 20:37 WIB — GAGAL, saldo 0 terverifikasi.** Faucet resmi
  https://faucet.hashkeychain.com TIDAK BISA DIAKSES (browser: ERR_SSL_UNRECOGNIZED_NAME_ALERT;
  curl dari VM: HTTP 000, bahkan dengan -k — situsnya memang tidak merespons, bukan
  masalah browser saja). Faucet thirdweb (https://thirdweb.com/hashkey-chain-testnet)
  hanya punya tombol "Connect Wallet" — tidak ada kolom tempel alamat; klaim 0,01
  HSK/hari hanya bisa setelah konek wallet (browser BERHENTI sesuai aturan, tanpa
  konek/tanda tangan apa pun). Saldo alamat Junes 0x00a8…92A di testnet terverifikasi
  0 HSK via eth_getBalance + explorer ("no transactions"). Pencarian 25 Nov 20:37
  tidak menemukan faucet HSK alternatif (QuickNode multi-chain faucet TIDAK
  mendukung HSK). **Jalan keluar:** (a) Junes klaim sendiri di thirdweb (konek
  wallet di HP/komputernya, tap "Get 0.01 tHSK"), atau lewat takeover browser;
  (b) coba lagi faucet resmi besok (mungkin sementara mati). Faucet ini memblokir
  DEPLOY testnet (butuh tHSK untuk gas), BUKAN penulisan kontrak — build kontrak
  tetap jalan.
- **Status RPC TERVERIFIKASI live 25 Nov 19:20 WIB (probe parent agent).** `eth_chainId` + `eth_blockNumber` menjawab di kedua RPC: testnet.hsk.xyz → chainId `0x85` (133), block `0x2288abb`; mainnet.hsk.xyz → chainId `0xb1` (177), block `0x1d364ec`; `web3_clientVersion` = `op-reth/v2.8.1` di keduanya. (Probe pertama 19:01 WIB sempat kosong karena timeout — bukan RPC-nya yang mati; GET biasa mengembalikan HTTP 403, itu normal untuk endpoint JSON-RPC.) Cadangan bila RPC publik lambat/dibatasi: Chainstack (dedicated node HSK, akun gratis), dRPC, Ankr.

## 3. HSP — HashKey Settlement Platform

- Produk: infrastruktur settlement on-chain HashKey Group untuk **AI agent dan
  perangkat keras**. Kompatibel dengan **protokol x402**. Inti yang dijual HSP:
  otorisasi pembayaran agen (**Mandate**) + mengubah hash on-chain menjadi
  dokumen keuangan yang bisa diaudit. Ada juga Master Account (agregasi dana
  enterprise) — tidak relevan untuk hackathon.
- Alur resmi menurut halaman lomba: Payment Agent mengambil **payment terms** dari
  agen penerima → membuat **Payment Mandate** → setelah **tanda tangan wallet**,
  memakai **HSP Gateway** yang sudah ada untuk **memverifikasi dan mengeksekusi**
  pembayaran on-chain.
- **DOKUMENTASI HSP DIDAPAT 25 Nov 19:24 WIB (live browser, read-only).** Dua lapis resmi + panduan hackathon:
  - **HashKey Merchant API docs (HSP Gateway):** https://hashkey-merchant.github.io/en/index.html#/ — halaman /overview, /onboarding, /authentication, /api-reference, /cart-mandate, /appendix. Base URL `/api/v1`: QA (testnet) https://merchant-qa.hashkeymerchant.com, Staging https://merchant-stg.hashkeymerchant.com, Production https://hsp.hashkey.com. QA terverifikasi hidup (HTTP 403 tanpa kredensial = auth dibutuhkan, sesuai harapan).
  - **Building on HSP — Developer Guide (HashFans):** https://hashfans.io/docs?id=HSP — arsitektur Coordinator, SDK @hsp/sdk, MCP tools, endpoint verifikasi.
  - **Panduan hackathon DoraHacks:** https://dorahacks.io/hackathon/hskchainseoul/agentic-payment-guide. Deck PDF tersimpan di `docs/Hashkey_Payment_Deck_CaaS_EN.pdf` (5,0 MB).
  - **Auth Merchant API:** HMAC-SHA256 semua panggilan `/api/v1/merchant/*` (header `X-App-Key`, `X-Signature`, `X-Timestamp` Unix skew ±300 dtk, `X-Nonce` unik; pesan `"{METHOD}\n{PATH}\n{QUERY}\n{bodyHash}\n{timestamp}\n{nonce}"`, bodyHash = hex SHA256 canonical JSON) + JWT ES256K `merchant_authorization` saat buat order (claims iss/sub = nama merchant, aud `HashkeyMerchant`, exp +1 jam, `cart_hash` SHA-256 isi Cart). Kredensial `app_key` + `app_secret` via registrasi merchant: buat key pair secp256k1 → kirim organization_name, email, description, default_language, service_rate, public_key, supported_chain_tokens → verifikasi email → buat application. **KOREKSI 25 Nov 21:08 (terverifikasi browser di portal resmi): TIDAK ADA pendaftaran mandiri — halaman login hsp.hashkey.com tidak punya tautan Sign up, dan /register, /signup, /invite semuanya 404. Dokumen /onboarding menjelaskan: data diserahkan ke tim operations agar mereka membuat organization invite; baru dari tautan undangan itu pendaftaran + pembuatan application bisa dilakukan. Kontak resmi terverifikasi: hsp@hashkey.com (Privacy Policy portal). merchant@hashkey.com TIDAK ditemukan di halaman resmi mana pun (portal/ToS/dokumentasi) — tidak terverifikasi; email onboarding dikirim 25 Nov 21:09 ke hsp@hashkey.com dengan Cc merchant@hashkey.com. Key pair merchant di `merchant-key.pem` terverifikasi secp256k1 (dicek ulang 21:09; sempat diregenerasi 21:09 karena dugaan kurva salah — ternyata keduanya secp256k1; yang berlaku adalah key hasil regenerasi 21:09).**
  - **Endpoint kunci Merchant API:** `POST /merchant/orders` (body: JWT merchant_authorization + cart), `POST /merchant/orders/reusable`, `GET /merchant/payments`, `GET /merchant/payments/reusable`; envelope `{code: 0, data: ...}`. MCP tools (panduan DoraHacks): `get_chain_config`, `create_order`, `submit_payment` (body gateway_order_id, payer, signature, permit); checkout mengembalikan `{checkout_url, payment_id, gateway_url}`; pembayaran 3–15 detik; Gateway memvalidasi cart, mandate, permit, quote, expiry.
  - **Verify/settle:** TIDAK ada endpoint REST "verify"/"settle" langsung di Merchant API — verifikasi + eksekusi on-chain terjadi di dalam HSP Gateway setelah wallet mengirim pembayaran bertanda tangan (via `submit_payment` / halaman checkout). HSP Protocol (HashFans) punya `POST /payments`, `POST /payments/:id/observe`, `GET /payments/:id`, `/explain`, `/requirements`, `/chains`, `/stats`, `GET /payments/:id/verify` (verifikasi ulang dari rantai), `/settle`, `/refund`; MCP `hsp_quote`, `hsp_pay`, `hsp_status`, `hsp_verify`. Settlement zero-custody: wallet payer sendiri yang broadcast transfer on-chain; verifier independen memeriksa receipt vs mandate; `ACCEPT` berarti ship.
  - **Alamat HSP Gateway contract TIDAK dipublikasikan** — `get_chain_config` mengembalikan `contract_address` dinamis per chain; panduan HashFans memakai placeholder `<...>` untuk adapter/verifying contract.
  - **Alamat token (terverifikasi on-chain 25 Nov 19:24 WIB, eth_getCode ada bytecode):** testnet HSK 133: USDC `0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6` (EIP-3009), USDT `0x372325443233fEbaC1F6998aC750276468c83CC6` (Permit2). Mainnet 177: USDC `0x84fA0c5a2E8CEb4C5BfA8E9fB5F2aA93f3fA6a39`, USDT `0x9C9aFD3B8Ffcd3B98C1B5A5E1f2D3C4B5A6B7C8D9E`.
  - **Mandate:** Cart Mandate EIP-712, domain name `"HashKey Merchant Cart"`, version `"1"`, verifyingContract = alamat kontrak token; field chain (mis. `"hashkey-testnet"`), token (`"USDC"`), payment_amount (satuan terkecil, `"1000000"` = 1 USDC), payment_amount_usd, payee, nonce, expiry (ISO 8601 UTC), cart_hash (hex SHA-256), signature. HSP Protocol Mandate EIP-712, domain `"HSP Payment Mandate"`, field payment_id, payer, recipient, token, amount, token_amount, nonce, expiry, chain_id, requirements_hash.
  - **Faucet resmi:** https://faucet.hashkeychain.com. Explorer testnet: https://hashkeychain-testnet-explorer.alt.technology.
  - **Batasan yang dinyatakan dokumen sendiri:** panduan HashFans masih placeholder `<...>` untuk Coordinator URL, API key, faucet, dan link repo SDK — "dibagikan organizer setelah sandbox dideploy, biasanya beberapa hari kemudian". **Base URL HSP Protocol (Coordinator) belum dipublikasikan per 25 Nov 2026** — jalur HSP Protocol belum bisa dipakai sampai itu keluar; jalur Merchant API (QA) yang bisa jalan dulu, dengan registrasi merchant.
  - Catatan: halaman /tracks DoraHacks terbuka normal di browser (HTTP 405 hanya pada fetch langsung); halaman "Webhooks" di docs Merchant mati (route #/webhooks 404).
- Bukti HSP itu nyata dan dipakai: 12 Nov 2026 HashKey mengumumkan HSP dipakai
  Pandabot Café (kafe robot di Hong Kong) — checkout pilih stablecoin/HSK lewat
  wallet EVM, settlement di HSK Chain. Siaran pers yang sama menegaskan HSP adalah
  protokol/kerangka teknis, bukan entitas teregulasi.

## 4. x402 — protokol yang dipakai HSP (referensi pengganti sementara)

Karena dokumen HSP belum ada, pola x402 publik adalah acuan implementasi sementara.
Semua ini fakta x402 umum, BUKAN klaim tentang endpoint HSP:

- x402 v2 (spesifikasi Des 2025), dulu Coinbase, kini x402 Foundation (Linux
  Foundation). Repo referensi: x402-foundation/x402. SDK TypeScript/Python/Go.
- Alur: client minta resource → server jawab **402 Payment Required** dengan header
  `PAYMENT-REQUIRED` (harga: scheme, network CAIP-2, amount, asset, payTo,
  maxTimeoutSeconds) → client tanda tangani **EIP-3009 `transferWithAuthorization`**
  (from, to, value, validAfter, validBefore, nonce unik) → retry dengan header
  `PAYMENT-SIGNATURE` → facilitator `POST /verify` (tidak mengubah state) →
  handler jalan → facilitator `POST /settle` → server jawab 200 + header
  `PAYMENT-RESPONSE` berisi tx hash.
- Network CAIP-2: HSK mainnet = `eip155:177`, HSK testnet = `eip155:133`.
- Facilitator itu "opsional tapi direkomendasikan": dia memverifikasi tanda tangan
  dan mengirim transaksi settlement (dia yang bayar gas), tanpa memegang dana.
  Facilitator publik x402.org hanya untuk testnet. **Facilitator Ultravioleta**
  (https://facilitator.ultravioletadao.xyz, Swagger di /docs) mendukung HashKey
  mainnet + testnet — tapi itu facilitator milik peserta lain (lihat §5); pakai
  sebagai cadangan, bukan fondasi. Alternatif yang lebih mandiri: server kita
  sendiri yang mengirim `transferWithAuthorization` (bayar gas pakai tHSK/HSK
  sendiri), atau self-host facilitator open-source x402-rs.
- Referensi pola facilitator: Morph x402 docs (POST /v2/verify, /v2/settle,
  /v2/supported, auth HMAC) — bentuk API-nya mirip seperti yang biasa dipakai
  gateway sejenis; dipakai sebagai template, bukan sebagai fakta HSP.

## 5. Kompetitor di track yang sama — AgentSettle (Ultravioleta DAO)

- Video demo: https://www.youtube.com/watch?v=EBvIWylq_n8 (23 hari lalu).
- Yang mereka bangun: HTTP 402 + otorisasi EIP-3009 USDC tanpa gas via facilitator
  x402 + **satu receipt on-chain per tugas berbayar**. Pembayaran yang ditunjukkan:
  transfer **0,10 USDC nyata di Ethereum Sepolia** (USDC resmi Circle). Kontrak
  receipt sudah deploy + terverifikasi source di **HSK Chain mainnet (chain 177)**.
  Integrasi "HSP Agentic Payment" mereka sudah dibangun dan dites; **QA payment
  pertamanya tertunda karena menunggu USDC testnet HashKey**. Spend cap pembeli:
  0,50 USDC/transaksi, 5,00 USDC/hari.
- Repo GitHub mereka tidak berhasil dipulihkan — tautan di deskripsi video terpotong
  (`github.com/0xultravioleta/age...`). Jangan jadikan itu acuan kode; cukup
  jadikan patokan level: mereka sudah punya receipt mainnet + facilitator yang
  di-merge ke x402 mereka.
- **Implikasi buat kita:** jangan membangun "402 checkout + receipt" yang sama —
  itu sudah ada dan sudah lebih dulu. Pembeda yang direncanakan ada di PLAN.md
  (mandate registry + negosiasi antar-agen + escrow/release + ledger settlement
  yang bisa dibaca manusia).

## 6. Token settlement — masalah yang belum terjawab

- **Tidak ada alamat USDC testnet HSK Chain yang ditemukan di publik.** RDUSD
  (stablecoin RD Technologies, diterbitkan Anchorage Digital) baru diumumkan
  2 Nov 2026 untuk diuji di HSK Chain — belum ada tanggal mulai, belum ada alamat
  kontrak.
- Fakta bahwa AgentSettle pun menunggu USDC testnet HashKey menunjukkan USDC
  testnet itu langka/berizin, bukan faucet bebas.
- Rencana cadangan (sudah diputuskan di PLAN.md): deploy **MockUSDC sendiri di
  testnet** — ERC-20 dengan EIP-3009 (`transferWithAuthorization`) — sebagai token
  settlement demo, dan buat seluruh alur **agnostik terhadap token** (alamat token
  cuma config), supaya ganti ke USDC HSP/RDUSD nanti tinggal ganti alamat.
  Untuk mainnet, pembayaran demo cukup 0,10 USDC (patokan AgentSettle).

## 7. Hal yang masih harus diverifikasi (checklist hari pertama, 26 Nov)

1. [ ] RPC testnet.hsk.xyz + mainnet.hsk.xyz menjawab `eth_chainId` (probe 25 Nov
      gagal karena persetujuan kedaluwarsa — ulangi).
2. [ ] Faucet tHSK (thirdweb) berhasil klaim 0,01 tHSK; catat berapa kali bisa
      klaim dan cukup tidaknya buat deploy + testing.
3. [ ] Dokumen HSP: dapatkan URL manual (HashFans, menu atas) + API docs (tautan di
      halaman DoraHacks). Catat base URL, auth, endpoint verify/settle, alamat
      Gateway mainnet + testnet.
4. [ ] Cara mendapat USDC testnet HSP (atau konfirmasi bahwa memang tidak ada, lalu
      pakai MockUSDC).
5. [ ] Apakah form submit DoraHacks mewajibkan video demo (cek langsung saat buka
      form; di halaman detail tidak disebut eksplisit).
6. [ ] Akun/akses apa saja yang butuh Junes (DoraHacks join, Vercel deploy,
      YouTube upload video, dana HSK + USDC mainnet).

## Sumber (semua diakses 25 Nov 2026)

- DoraHacks HSK Chain Horizon Hackathon Seoul — https://dorahacks.io/hackathon/hskchainseoul/detail
- HSK Chain docs — https://docs.hskchain.net (Explorer, Safe)
- chainid.network/chains.json — chain 177 + 133 (RPC, explorer, native currency)
- Goldsky supported networks — HashKey 177 (mainnet)
- BlockReq — HashKey mainnet 0xb1 / testnet 0x85
- SQD — HashKey Chain dataset, chain 177
- thirdweb faucet guide tHSK — https://blog.thirdweb.com/faucet-guides/how-to-get-free-hashkey-token-thsk-from-hashkey-chain-testnet-faucet/
- HSP Pandabot Café — https://www.kucoin.com/news/flash/hashkey-hsp-expands-to-offline-retail-with-pandabot-cafe-chain-settlement-solution (juga EINPresswire 12 Nov 2026)
- HashKey Group + Base — https://group.hashkey.com/en/hsk-chain-and-base-collaborate-to-connect-asias-premier-onchain-asset-with-global-liquidity/
- RDUSD di HSK Chain — https://fintechnews.hk/41816/blockchain/hashkey-rdusd-hsk-chain-stablecoin-testing/
- AgentSettle demo — https://www.youtube.com/watch?v=EBvIWylq_n8
- Facilitator Ultravioleta — https://docs.execution.market/payments/facilitator (juga https://facilitator.ultravioletadao.xyz/docs)
- uvd-x402-sdk — https://pypi.org/project/uvd-x402-sdk/0.110.0/
- x402 v2 — https://www.tacnode.io/post/x402, https://devtoollab.com/blog/x402-ai-agent-payments-guide, https://docs.nethereum.com/docs/defi/guide-x402-payments/, https://c9group.dev/en/articles/x402-machine-payments-charge-ai-agents
- Morph x402 facilitator (pola API) — https://docs.morph.network/docs/morph-rails/agentic-payment/x402-facilitator
- HashFans forum — disebut sebagai "Hashfans forum" di profil HSK Chain (akta.pro); URL langsung belum ditemukan
