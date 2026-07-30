import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatDisplayFromISO } from '@/lib/analytics';
import { z } from 'zod/v4';

// Validation schema for partial updates
const updateRecordSchema = z.object({
  dateISO: z.string().min(1).optional(),
  quantity: z.number().int().optional(),
});

function formatRecord(record: { id: string; dateISO: string; quantity: number; floor: string }) {
  return {
    id: record.id,
    dateISO: record.dateISO,
    displayDate: formatDisplayFromISO(record.dateISO),
    quantity: record.quantity,
    floor: record.floor,
  };
}

// GET: Get a single stock record
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const record = await db.stockRecord.findUnique({ where: { id } });

    if (!record) {
      return NextResponse.json(
        { error: 'Stock record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(formatRecord(record));
  } catch (error) {
    console.error('Error fetching stock record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock record' },
      { status: 500 }
    );
  }
}

// PUT: Update a stock record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateRecordSchema.parse(body);

    const existing = await db.stockRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Stock record not found' },
        { status: 404 }
      );
    }

    const updateData: { dateISO?: string; quantity?: number } = {};
    if (parsed.dateISO !== undefined) updateData.dateISO = parsed.dateISO;
    if (parsed.quantity !== undefined) updateData.quantity = parsed.quantity;

    const record = await db.stockRecord.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(formatRecord(record));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error updating stock record:', error);
    return NextResponse.json(
      { error: 'Failed to update stock record' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a single stock record
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.stockRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Stock record not found' },
        { status: 404 }
      );
    }

    await db.stockRecord.delete({ where: { id } });
    return NextResponse.json({ message: 'Stock record deleted' });
  } catch (error) {
    console.error('Error deleting stock record:', error);
    return NextResponse.json(
      { error: 'Failed to delete stock record' },
      { status: 500 }
    );
  }
}
