// GET /api/terms — katalog jasa Sari (tanpa alamat penjual; alamat diikat
// saat negosiasi dimulai). Harga dalam string desimal + satuan terkecil.

import { NextResponse } from "next/server";
import { formatUsdc } from "../../../lib/mandate";
import { listServices } from "../../../server/terms";

export async function GET() {
  const services = listServices().map((service) => ({
    serviceId: service.serviceId,
    title: service.title,
    description: service.description,
    listPrice: service.listPrice.toString(),
    listPriceUsdc: formatUsdc(service.listPrice),
    token: service.token,
    maxTurnaroundMinutes: service.maxTurnaroundMinutes,
  }));
  return NextResponse.json({ services });
}
