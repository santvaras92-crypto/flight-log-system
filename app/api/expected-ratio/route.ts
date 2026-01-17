import { NextRequest, NextResponse } from 'next/server';
import { getExpectedRatio } from '@/lib/hobbs-predictor';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tachDeltaStr = searchParams.get('tachDelta');

    if (!tachDeltaStr) {
      return NextResponse.json(
        { error: 'Missing tachDelta parameter' },
        { status: 400 }
      );
    }

    const tachDelta = parseFloat(tachDeltaStr);

    if (isNaN(tachDelta) || tachDelta <= 0) {
      return NextResponse.json(
        { error: 'Invalid tachDelta value' },
        { status: 400 }
      );
    }

    const result = await getExpectedRatio(tachDelta);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calculating expected ratio:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
