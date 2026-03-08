import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache 1 hour

export async function GET() {
  try {
    // Fetch UF and Dollar in parallel from mindicador.cl
    const [ufRes, dolarRes] = await Promise.all([
      fetch('https://mindicador.cl/api/uf', { next: { revalidate: 3600 } }),
      fetch('https://mindicador.cl/api/dolar', { next: { revalidate: 3600 } }),
    ]);

    const ufData = ufRes.ok ? await ufRes.json() : null;
    const dolarData = dolarRes.ok ? await dolarRes.json() : null;

    const ufValor = ufData?.serie?.[0]?.valor ?? null;
    const ufFecha = ufData?.serie?.[0]?.fecha ?? null;
    const dolarValor = dolarData?.serie?.[0]?.valor ?? null;
    const dolarFecha = dolarData?.serie?.[0]?.fecha ?? null;

    return NextResponse.json({
      uf: ufValor ? { valor: ufValor, fecha: ufFecha } : null,
      dolar: dolarValor ? { valor: dolarValor, fecha: dolarFecha } : null,
      source: 'mindicador.cl',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching economic indicators:', error);
    return NextResponse.json({ uf: null, dolar: null, error: 'Failed to fetch' }, { status: 500 });
  }
}
