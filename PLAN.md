# PLAN — Selesai: Meja Settlement Antar-Agen di HSK Chain

**Hackathon:** HSK Chain Horizon Hackathon · Seoul, Track 2 — Agent Payments & A2A
Settlement (HSP) · **Deadline submit: 3 Des 2026 11:00 WIB** · Demo Day 5 Des,
pemenang 6 Des · Hadiah track: 1st 3.000 / 2nd 2.000 / 3rd 1.000 USDT.
**Builder:** Vexor (solo). **Repo:** baru, dibuat selama hackathon (jangan pakai ulang
repo lama — syarat orisinalitas). **Status dokumen ini:** rencana + riset, 25 Nov
2026. Implementasi mulai SETELAH dokumen ini direview.

Riset pendukung (sumber + yang belum jelas) ada di `RESEARCH.md`. Baca itu dulu
sebelum menyentuh rencana ini.

## 0. Ide dalam satu paragraf

Nama kerja: **Selesai** — dari bahasa Indonesia, "selesai" = tuntas, beres, urusan kelar.
Bukan checkout sekali bayar. Selesai adalah meja settlement tempat dua agen AI
bernegosiasi, menyepakati harga, lalu membayar lewat **Payment Mandate** yang
ditandatangani wallet, diverifikasi + dieksekusi **HSP Gateway**, dan setiap
pembayaran meninggalkan **receipt on-chain yang bisa dibaca manusia** seperti
dokumen tagihan — bukan cuma tx hash. Pembeli punya batas belanja (per transaksi +
per hari) yang tertulis di mandate dan bisa dicabut kapan saja. Satu dashboard
menunjukkan semua mandate, sisa batas, settlement, dan receipt.

Kenapa bukan sekadar "402 checkout"? Karena itu sudah dibangun peserta lain di
track yang sama (AgentSettle: 402 + EIP-3009 + receipt, kontrak receipt sudah di
mainnet 177). Meniru mereka berarti kalah di "sudah duluan". Selesai mengambil
bagian yang justru dijual HSP sendiri tapi belum ada yang menunjukkannya end-to-end:
**mandate sebagai dokumen keuangan yang bisa diaudit** — negosiasi → mandate →
tanda tangan → gateway → receipt yang terbaca.

## 1. Masalah yang diselesaikan

Agen AI hari ini bisa janji kerja, tapi tidak bisa bayar dengan cara yang bisa
dipertanggungjawabkan. Kalau Agen A menyuruh Agen B mengerjakan sesuatu:

- Tidak ada bukti tertulis yang mengikat sebelum uang bergerak (cuma chat log).
- Tidak ada batas belanja — sekali kunci privat bocor atau agen "lapar", saldo bisa
  terkuras.
- Bukti bayar cuma tx hash — auditor/manusia harus menebak-nebak: ini bayar apa,
  atas dasar kesepakatan apa, siapa yang menyetujui?
- Settlement antar-agen yang ada hari ini menempel ke satu chain/token dan satu
  facilitator; ganti token berarti tulis ulang.

Selesai menjawab keempatnya dengan satu alur yang sama dari awal sampai akhir:
kesepakatan tertulis (terms) → mandate bertanda tangan (batas + masa berlaku) →
eksekusi lewat gateway → receipt yang merujuk balik ke mandate dan terms-nya.

## 2. Scope — apa yang dibangun, apa yang tidak

**Masuk (harus ada di demo):**
1. Katalog jasa agen penjual — tiap jasa punya payment terms (harga, token,
   deskripsi kerja, estimasi selesai). Terms disajikan sebagai objek JSON yang
   bisa dibaca mesin (mirip `PaymentRequired` x402) dan dibaca manusia.
2. Negosiasi singkat antar-agen lewat HTTP: agen pembeli menawar, agen penjual
   menerima/menolak/memberi harga tandingan, maksimal 3 putaran. Hasilnya satu
   terms final yang disepakati.
3. Payment Mandate (EIP-712): pembeli menandatangani mandate berisi payee, token,
   jumlah, batas per transaksi, batas harian, masa berlaku, nonce. Mandate bisa
   dicabut (revoke) sebelum dipakai.
4. Verifikasi + eksekusi: mandate dikirim ke HSP Gateway (jalur utama). Bila API
   HSP belum bisa dipakai saat build, fallback yang tetap jujur: eksekusi
   `transferWithAuthorization` (EIP-3009) langsung dari server + verifikasi
   tanda tangan di server. Fallback ini dicatat terbuka di README dan di video —
   jangan pura-pura HSP kalau yang jalan fallback.
5. Receipt Registry (kontrak): tiap settlement menulis satu receipt on-chain
   (mandate hash, payer, payee, token, amount, tx hash, status). Receipt bisa
   dibuka dari dashboard dan diverifikasi siapa saja lewat explorer.
6. Dashboard: daftar mandate (aktif/digunakan/dicabut), sisa batas harian,
   riwayat settlement, dan halaman receipt yang tampil seperti dokumen tagihan.
7. Dua agen demo yang bisa dijalankan: Agen Pembeli ("Bima") dan Agen Penjual
   ("Sari") — nama fiktif, kerjaannya konkret: Sari menjual ringkasan riset
   (contoh: ringkasan 5 sumber tentang topik yang diminta), Bima membeli 3
   ringkasan dengan total cap harian 5,00 USDC. Demo end-to-end: negosiasi →
   mandate → bayar → receipt, dua kali (satu berhasil, satu ditolak karena
   melewati cap — ini yang menunjukkan guardrail bekerja).

**Sengaja tidak masuk (biar 7 hari cukup):**
- Trading (itu Track 1), multi-chain, token selain USDC/MockUSDC, fiat on/off-ramp.
- Login pengguna / akun — demo pakai wallet yang dibuat lokal untuk hackathon.
- Escrow multi-langkah (tahan dana → rilis setelah kerja selesai). Ini bagus, tapi
  tidak muat; dicatat sebagai "next step" di README, bukan janji kosong.
- Mobile app. Dashboard web responsif saja.

## 3. Alur end-to-end (yang direkam di video demo)

1. Bima membuka katalog Sari, memilih jasa "Ringkasan riset 5 sumber" (harga
   tercantum 0,50 USDC).
2. Bima menawar 0,40 USDC. Sari menolak, menawar balik 0,45 USDC. Bima menerima.
   Terms final: 0,45 USDC, 1 ringkasan, selesai maks 10 menit.
3. Bima membuat Payment Mandate: payee Sari, 0,45 USDC, cap per transaksi
   0,50 USDC, cap harian 5,00 USDC, berlaku 1 jam. Bima menandatangani (EIP-712)
   di wallet-nya. Mandate tampil di dashboard dengan status "aktif".
4. Sari mengirim hasil kerja (file ringkasan) + menagih lewat mandate.
5. Sistem memverifikasi: tanda tangan cocok, jumlah ≤ cap, belum kedaluwarsa,
   nonce belum dipakai, saldo cukup. Lalu eksekusi via HSP Gateway (atau fallback
   EIP-3009). Tx hash kembali.
6. Receipt ditulis ke kontrak ReceiptRegistry di HSK testnet. Dashboard
   menampilkan receipt seperti dokumen: nomor, tanggal, pihak, jumlah, mandate
   hash, tx hash + tautan explorer.
7. Percobaan kedua: Bima mencoba membayar 0,60 USDC (di atas cap 0,50) — sistem
   menolak sebelum uang bergerak, dengan alasan yang terbaca. Ini adegan penting
   di video: guardrail yang gagal bayar itu fitur, bukan bug.

## 4. Arsitektur

```
Agen Pembeli (Bima)            Agen Penjual (Sari)
   |  HTTP: katalog + tawar       |  HTTP: terms + hasil kerja
   v                              v
┌─────────────────────────────────────────────────┐
│  Selesai — Next.js app (Vercel)                   │
│  /api/terms      katalog + negosiasi            │
│  /api/mandates   buat/verifikasi/cabut mandate  │
│  /api/settle     eksekusi via HSP Gateway       │
│                  (fallback: EIP-3009 langsung)  │
│  /api/receipts   baca receipt dari chain        │
│  Dashboard       mandate, cap, settlement       │
└───────────────┬─────────────────────────────────┘
                │ viem (baca/tulis chain)
                v
┌─────────────────────────────────────────────────┐
│  HSK Chain testnet (133) — dev & demo           │
│  • MockUSDC (ERC-20 + EIP-3009)                 │
│  • ReceiptRegistry (receipt per settlement)      │
│  HSK Chain mainnet (177) — HANYA kontrak        │
│  ReceiptRegistry (untuk syarat demo selection)   │
└─────────────────────────────────────────────────┘
                │ HTTPS (bila docs didapat)
                v
         HSP Gateway API (verify + settle)
```

- **Satu-satunya bagian yang menyentuh uang adalah `src/server/settle` + kontrak.**
  Semua yang lain (katalog, negosiasi, dashboard) tidak memegang kunci privat.
  Kunci wallet demo hidup di `.env` server saja, tidak pernah ke browser.
- **Adapter HSP.** Semua panggilan HSP dibungkus satu modul (`src/server/hsp.ts`,
  ditulis saat implementasi — BUKAN sekarang). Modul itu punya satu interface:
  `verify(mandate)`, `settle(mandate)`, `supported()`. Kalau dokumen HSP ternyata
  beda bentuk dari perkiraan, yang berubah cuma isi modul itu. Fallback EIP-3009
  adalah implementasi kedua dari interface yang sama.
- **Token-agnostik.** Alamat token settlement cuma config (`.env`). Testnet pakai
  MockUSDC yang kita deploy sendiri; mainnet pakai USDC/HSP yang sebenarnya
  (alamat diisi setelah diverifikasi).
- **Kontrak minimal, dua saja:**
  - `MockUSDC` — ERC-20 + EIP-3009 `transferWithAuthorization`, mint bebas
    (testnet saja, tidak pernah di mainnet).
  - `ReceiptRegistry` — `recordReceipt(mandateHash, payer, payee, token, amount,
    txHash)` + event `ReceiptRecorded`. Tidak memegang dana. Ini kontrak yang
    di-deploy ke mainnet juga (murah, tidak ada dana di dalamnya).

## 5. Tech stack (dipilih karena sudah dikuasai, bukan karena tren)

- **Next.js 14+ (App Router, TypeScript)** — satu repo untuk UI + API; deploy
  Vercel (sudah dipakai Junes untuk AgentTicket, jadi tidak ada belajar alat baru).
- **viem** — baca/tulis chain, EIP-712 signing, EIP-3009. Dipilih atas ethers
  karena tipenya ketat dan ukurannya kecil.
- **Hardhat** — compile + deploy kontrak; script deploy testnet/mainnet terpisah.
- **Node 20 LTS**, **Vitest** — unit test; **Playwright tidak dipakai** (terlalu
  berat untuk 7 hari; E2E dites lewat skrip node + cek manual di browser).
- **Tailwind** — styling dashboard (sudah ada di template Next.js).
- Bahasa UI: Inggris (juri internasional); dokumen + komentar kode: campur
  Inggris/Indonesia seperlunya, yang penting konsisten.
- Penyimpanan: **tanpa database.** State demo (katalog, negosiasi, mandate)
  disimpan di file JSON lokal server + dibaca ulang dari chain untuk receipt.
  Ini sengaja — database menambah titik gagal dan waktu setup tanpa menambah nilai
  demo.

## 6. Struktur repo (scaffold sudah dibuat — lihat README.md repo)

```
hsk-2026/
  PLAN.md  RESEARCH.md  README.md
  package.json  tsconfig.json  next.config.mjs  hardhat.config.ts
  .env.example  .gitignore
  contracts/        → MockUSDC + ReceiptRegistry (ditulis 27 Nov)
  src/
    app/            → halaman Next.js (katalog, dashboard, receipt)
    server/         → API routes: terms, mandates, settle, receipts + adapter HSP
    lib/            → chains.ts (config jaringan — SUDAH ADA), + util nanti
    components/     → komponen dashboard
  tests/            → vitest (smoke test config sudah jalan)
  docs/             → catatan harian build (1 file per hari, singkat)
```

## 7. Milestone harian (26 Nov → 3 Des)

| Hari | Tanggal | Target selesai (definisi "selesai" = bisa didemokan) |
|---|---|---|
| 1 | Rab 26 Nov | **Verifikasi akses.** RPC testnet+mainnet menjawab ✅ (19:20); klaim tHSK dari faucet ❌ GAGAL 20:37 (faucet resmi tidak bisa diakses; thirdweb butuh konek wallet Junes — lihat RESEARCH.md §2; saldo 0 terverifikasi); dapatkan manual HSP (HashFans) + API docs (tautan DoraHacks) ✅ (19:24); putuskan token settlement (MockUSDC bila USDC HSP tidak ada) ✅ — USDC HSP testnet ada + terverifikasi on-chain, MockUSDC jadi fallback saja. Repo GitHub VexorHQ dibuat, scaffold ini di-push, commit pertama (menunggu Junes pilih repo di instalasi GitHub). |
| 2 | Kam 27 Nov | **Kontrak di testnet.** MockUSDC + ReceiptRegistry compile, deploy ke testnet 133, terverifikasi di explorer. Tipe mandate EIP-712 + fungsi sign/verify lolos unit test. |
| 3 | Jum 28 Nov | **Alur bayar jalan.** API terms → negosiasi → mandate → settle (fallback EIP-3009 dulu) → receipt tercatat. Dua agen demo (Bima/Sari) bisa menyelesaikan satu pembayaran penuh lewat skrip. |
| 4 | Sab 29 Nov | **Dashboard + E2E.** UI katalog, dashboard mandate/cap, halaman receipt. E2E lengkap di testnet, direkam sekali untuk melihat alurnya dari mata pengguna. |
| 5 | Min 30 Nov | **HSP beneran atau dokumentasi jujur.** Kalau docs HSP didapat, pasang adapter HSP dan uji ulang E2E lewat gateway. Kalau tidak, tulis di README dengan jelas jalur mana yang HSP dan mana yang fallback — tanpa mengarang. |
| 6 | Sen 1 Des | **Mainnet + video.** Deploy ReceiptRegistry ke mainnet 177 (butuh HSK asli — lihat §9), verifikasi source. Rekam video demo ≤3 menit. README + deskripsi submission ditulis. |
| 7 | Sel 2 Des | **Buffer.** Perbaiki yang patah, uji ulang E2E testnet + mainnet, rapikan submission (repo publik, live demo, video, deskripsi). Jangan tambah fitur baru hari ini. |
| 8 | Rab 3 Des | **Submit sebelum 11:00 WIB.** Kirim di DoraHacks, verifikasi status submission tampil, simpan bukti (screenshot + tautan). |

Catatan: tanggal 26 Nov juga ada Agent Arena (submission buka 00:00) — bagi waktu
dengan sadar. Kalau hari 1 verifikasi akses gagal total (mis. RPC mati + HSP tidak
bisa dihubungi), keputusan "lanjut atau berhenti" diambil sore 26 Nov, bukan
dipaksakan sampai 3 Des.

## 8. Risiko (diurutkan dari yang paling mengancam)

1. **Dokumen HSP tidak didapat.** Dampak: tidak tahu endpoint/auth/Gateway —
   jalur "HSP" tidak bisa dibuktikan. Mitigasi: adapter + fallback EIP-3009;
   minta docs lewat HashFans + DoraHacks; tulis jujur di submission mana bagian
   yang HSP. *Status: DIDAPAT 25 Nov 19:24 (Merchant API docs + HashFans guide +
   panduan DoraHacks + deck PDF di docs/; RPC testnet+mainnet terverifikasi
   hidup; token settlement testnet = USDC HSP 0x8FE3…F53c6, terverifikasi
   on-chain. Sisa: Coordinator URL HSP Protocol masih placeholder + registrasi
   merchant butuh akun/email Junes).*
2. **Mainnet praktis wajib untuk demo selection, tapi dana Junes minim.** Deploy
   kontrak receipt di mainnet butuh HSK asli (jumlah belum diketahui — cek harga
   gas mainnet hari 1). Pembayaran demo mainnet cukup 0,10 USDC (patokan
   AgentSettle). **Keputusan butuh Junes:** anggaran beli HSK + USDC mainnet
   secukupnya, dan dari mana. Tanpa ini, proyek hanya bisa submit, tidak bisa
   menang.
3. **USDC testnet langka.** Kompetitor saja menunggu USDC testnet HashKey.
   Mitigasi: MockUSDC sendiri (sudah direncanakan); token-agnostik.
4. **RPC publik belum terbukti hidup.** Probe 25 Nov gagal karena persetujuan
   kedaluwarsa, bukan karena RPC mati — tapi tetap belum terbukti. Mitigasi:
   verifikasi hari 1; cadangan Chainstack/dRPC/Ankr.
5. **Waktu bentrok.** Agent Arena (26 Nov–11 Des), Raenest (14 Des), Nosa
   (30 Nov) jalan paralel. Mitigasi: milestone di atas tidak bisa ditawar;
   potong scope, bukan tambah hari.
6. **Kalah pembeda lawan AgentSettle.** Mereka sudah punya receipt mainnet +
   facilitator. Mitigasi: bedakan di mandate registry + negosiasi + halaman
   receipt yang terbaca + guardrail cap yang didemokan gagal bayar.
7. **Demo Day di Seoul, Junes di Jakarta.** In-person diprioritaskan. Mitigasi:
   video demo yang berdiri sendiri + live demo yang bisa dibuka juri tanpa
   Junes hadir; siapkan slot presentasi online.

## 9. Rencana testing

- **Unit (Vitest, jalan tiap commit):** EIP-712 sign/verify mandate; validasi cap
  (jumlah > cap per transaksi ditolak; akumulasi harian > cap ditolak); nonce
  tidak bisa dipakai dua kali; mandate kedaluwarsa ditolak; revoke menonaktifkan
  mandate.
- **Kontrak (Hardhat):** deploy lokal → recordReceipt menyimpan + event keluar;
  MockUSDC `transferWithAuthorization` berhasil + nonce tidak bisa dipakai ulang.
- **E2E testnet (skrip node, 29 Nov):** Bima–Sari menyelesaikan satu pembayaran
  penuh; cek receipt di explorer; cek penolakan di atas cap. Dicatat di
  `docs/` beserta tx hash.
- **E2E mainnet (1 Des, hanya receipt):** deploy + satu receipt tercatat;
  pembayaran mainnet (kalau ada dana) maksimal 0,10 USDC.
- **Uji "mata juri":** buka live demo dari browser bersih (tanpa login, tanpa
  wallet Junes) dan pastikan alur demo bisa diikuti dalam 3 menit.

## 10. Checklist submission (diisi saat submit, 3 Des)

- [ ] Repo GitHub publik (VexorHQ), README lengkap, commit pertama di dalam
      jendela hackathon (20 Nov–3 Des).
- [ ] Live demo (Vercel) bisa dibuka tanpa login.
- [ ] Kontrak ReceiptRegistry ter-deploy + terverifikasi source di testnet 133
      (dan mainnet 177 bila dana ada).
- [ ] Video demo ≤3 menit (tautan YouTube publik, Vexor Builds) — verifikasi
      dulu apakah form DoraHacks mewajibkan video.
- [ ] Deskripsi submission: masalah, alur, apa yang HSP, apa yang fallback,
      tautan repo/demo/video/kontrak.
- [ ] Track yang dipilih: Track 2. Kategori/teknologi diisi sesuai form.
- [ ] Bukti submit tersimpan (screenshot + tautan submission).

## 11. Keputusan — DIPUTUSKAN 25 Nov 20:52 WIB (Junes: "kamu pilih dan buat sendiri saja" / "kamu atur saja")

1. **Nama proyek "Selesai"** — DIPAKAI. Repo `VexorHQ/selesai` (publik). **Diganti dari "Lunas" 25 Nov 21:34 WIB atas perintah Junes ("Ganti kata lunas dengan selesai")** — seluruh kode, dokumen, UI, nama file kunci deployer, dan repo GitHub ikut diganti; email permohonan merchant HSP yang sudah terkirim 21:09 masih memakai nama lama (koreksi menyusul).
2. **Anggaran mainnet: 3 HSK + 0,50 USDC.** Hitungan dari gas nyata (diukur di Hardhat lokal 25 Nov 20:52, gas price mainnet 500 gwei dari RPC): deploy ReceiptRegistry 2.284.867 gas = 1,14 HSK; satu recordReceipt 411.756 gas = 0,21 HSK; satu settle EIP-3009 (~150k gas) = 0,075 HSK. Demo lengkap (deploy + 2 settle + 2 receipt) = 1,70 HSK; 3 HSK memberi buffer ~1,3 HSK untuk lonjakan gas/percobaan ulang. USDC 0,50 = pembayaran demo 0,45 + margin. **Pembelian HSK + USDC mainnet BELUM dilakukan** — butuh jalur (exchange/bridge) + dana; disiapkan setelah deploy testnet jalan. Tanpa mainnet, peluang menang praktis nol (§8.2).
3. **Akses HSP:** registrasi merchant pakai email **vexordev@proton.me**, organisasi **"Vexor"** (key pair secp256k1 sudah dibuat 25 Nov 20:35, diregenerasi 21:09). Portal merchant TIDAK punya pendaftaran mandiri — permohonan onboarding dikirim via email ke tim operations HashKey 21:09 (hsp@hashkey.com, Cc merchant@hashkey.com); undangan organisasi ditunggu.
4. **Video demo:** Scout siapkan file mentah + upload sendiri ke Vexor Builds (hari ke-6, 1 Des). Bukan Junes yang upload.
5. **Go/no-go 26 Nov sore: LANJUT.** Verifikasi akses hari-1 tidak gagal total (RPC ✓, docs HSP ✓, token ✓); yang tertunda hanya faucet (retry terjadwal besok pagi) dan repo (sedang dibuat).

## 12. Aturan kerja selama build (supaya hasilnya tidak terlihat seperti AI)

- Tulis kode seperti orang yang sedang berpikir: nama variabel dari domain
  (mandate, payee, cap), bukan `data1/data2`; komentar hanya di bagian yang
  memang tidak jelas dari kodenya; jangan menulis ulang pola yang sama di tiga
  tempat.
- UI dashboard: pakai angka dan contoh nyata dari skenario demo (Bima, Sari,
  0,45 USDC), bukan lorem ipsum dan bukan kartu contoh generik.
- Setiap hari tulis `docs/YYYY-MM-DD.md` singkat: apa yang dikerjakan, apa yang
  patah, apa yang diputuskan. Bukan laporan formal — catatan kerja.
- Jangan klaim "selesai" sebelum E2E-nya jalan dan terlihat di explorer.
