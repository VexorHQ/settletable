// Katalog jasa Sari + payment terms — dibaca mesin (JSON) dan manusia.
// Sari menjual satu jasa dulu: ringkasan riset 5 sumber. Harga tercantum
// 0,50 USDC; harga akhir ditentukan negosiasi (lihat negotiate.ts), bukan
// katalog. Alamat penjual tidak ada di katalog — diikat saat negosiasi
// dimulai, supaya katalog yang sama bisa dipakai Sari dari wallet mana pun.

import { formatUsdc, usdc } from "../lib/mandate";

export interface ServiceTerms {
  serviceId: string;
  title: string;
  description: string;
  listPrice: bigint; // satuan terkecil USDC (6 desimal)
  token: string; // "USDC"
  maxTurnaroundMinutes: number;
}

export interface CartItem {
  item_id: string;
  name: string;
  description: string;
  price: string; // desimal, mis. "0.50"
  quantity: number;
}

export const SARI_CATALOG: ServiceTerms[] = [
  {
    serviceId: "riset-5-sumber",
    title: "Ringkasan riset 5 sumber",
    description:
      "Ringkasan berbahasa Indonesia dari 5 sumber terpercaya tentang topik yang diminta, selesai maks 10 menit, dikirim sebagai file teks.",
    listPrice: usdc("0.50"),
    token: "USDC",
    maxTurnaroundMinutes: 10,
  },
];

export function listServices(): ServiceTerms[] {
  return [...SARI_CATALOG];
}

export function findService(serviceId: string): ServiceTerms | undefined {
  return SARI_CATALOG.find((service) => service.serviceId === serviceId);
}

/**
 * Item cart untuk cart_hash mandate. Harga item = harga yang disepakati
 * (bukan harga katalog) — cart adalah isi keranjang yang disetujui
 * pembeli, jadi jumlahnya harus sama dengan payment_amount di mandate.
 */
export function cartForService(service: ServiceTerms, agreedPrice: bigint = service.listPrice, quantity = 1): CartItem[] {
  return [
    {
      item_id: service.serviceId,
      name: service.title,
      description: service.description,
      price: formatUsdc(agreedPrice),
      quantity,
    },
  ];
}
