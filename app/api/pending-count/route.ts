import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [pendingFlights, pendingDeposits, pendingFuel] = await Promise.all([
      prisma.flightSubmission.count({
        where: { estado: { in: ['PENDIENTE', 'ESPERANDO_APROBACION', 'REVISION'] } },
      }),
      prisma.deposit.count({
        where: { estado: 'PENDIENTE' },
      }),
      prisma.fuelLog.count({
        where: { estado: 'PENDIENTE' },
      }),
    ]);

    return NextResponse.json({ count: pendingFlights + pendingDeposits + pendingFuel });
  } catch (e) {
    console.error('pending-count error:', e);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
