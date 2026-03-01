import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ count: 0 }, { status: 401 });
    }

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
  } catch {
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
