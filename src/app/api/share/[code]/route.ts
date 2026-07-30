import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatDisplayFromISO } from '@/lib/analytics';

// GET: Fetch current stock data for a shared link (by code)
// The shared link just stores the code — the actual data is always StockRecords in the DB
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const link = await db.sharedLink.findUnique({
      where: { code },
    });

    if (!link) {
      return NextResponse.json({ error: 'Ссылка не найдена' }, { status: 404 });
    }

    // Return the link metadata + all stock records (latest data)
    const records = await db.stockRecord.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const formattedRecords = records.map((r) => ({
      id: r.id,
      dateISO: r.dateISO,
      displayDate: formatDisplayFromISO(r.dateISO),
      quantity: r.quantity,
      floor: r.floor,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({
      code: link.code,
      name: link.name,
      updatedAt: link.updatedAt.toISOString(),
      records: formattedRecords,
    });
  } catch (error) {
    console.error('Error fetching shared link:', error);
    return NextResponse.json({ error: 'Failed to fetch shared data' }, { status: 500 });
  }
}
