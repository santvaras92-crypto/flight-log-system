import { NextResponse } from 'next/server';
import { getUFValue, calculateUFRate } from '@/lib/uf-service';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export async function GET() {
  try {
    const { valor, fecha } = await getUFValue();
    const ratePerHour = calculateUFRate(4.5, valor);

    return NextResponse.json({
      uf: {
        valor,
        fecha,
        formatted: new Intl.NumberFormat('es-CL', {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(valor),
      },
      rate: {
        ufMultiplier: 4.5,
        perHour: ratePerHour,
        formatted: new Intl.NumberFormat('es-CL', {
          style: 'currency',
          currency: 'CLP',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(ratePerHour),
      },
    });
  } catch (error) {
    console.error('Error in UF API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch UF value' },
      { status: 500 }
    );
  }
}
