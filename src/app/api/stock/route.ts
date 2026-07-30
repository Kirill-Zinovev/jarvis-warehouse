import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatDisplayFromISO } from '@/lib/analytics';
import { z } from 'zod/v4';

// Validation schemas
const createRecordSchema = z.object({
  dateISO: z.string().min(1, 'dateISO is required'),
  quantity: z.number().int('Quantity must be an integer'),
  floor: z.string().default('1'),
});

// GET: Return stock records, optionally filtered by floor
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const floor = searchParams.get('floor');

    const where = floor ? { floor } : {};

    const records = await db.stockRecord.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const formatted = records.map((r) => ({
      id: r.id,
      dateISO: r.dateISO,
      displayDate: formatDisplayFromISO(r.dateISO),
      quantity: r.quantity,
      floor: r.floor,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching stock records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock records' },
      { status: 500 }
    );
  }
}

// POST: Create a new stock record (always creates, never overwrites)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createRecordSchema.parse(body);

    const record = await db.stockRecord.create({
      data: {
        dateISO: parsed.dateISO,
        floor: parsed.floor,
        quantity: parsed.quantity,
      },
    });

    const formatted = {
      id: record.id,
      dateISO: record.dateISO,
      displayDate: formatDisplayFromISO(record.dateISO),
      quantity: record.quantity,
      floor: record.floor,
    };

    return NextResponse.json(formatted, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating stock record:', error);
    return NextResponse.json(
      { error: 'Failed to create stock record' },
      { status: 500 }
    );
  }
}

// DELETE: Delete stock records, optionally filtered by floor
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const floor = searchParams.get('floor');

    const where = floor ? { floor } : {};
    await db.stockRecord.deleteMany({ where });

    return NextResponse.json({ message: 'Stock records deleted' });
  } catch (error) {
    console.error('Error deleting stock records:', error);
    return NextResponse.json(
      { error: 'Failed to delete stock records' },
      { status: 500 }
    );
  }
}
