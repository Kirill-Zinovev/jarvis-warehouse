import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod/v4';
import type { StockRecord } from '@/types/stock';

// Validation schema
const createSnapshotSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  floor: z.string().default('1'),
  records: z.array(
    z.object({
      id: z.string(),
      dateISO: z.string(),
      displayDate: z.string(),
      quantity: z.number().int(),
      floor: z.string().default('1'),
    })
  ),
});

// GET: Return snapshots, optionally filtered by floor
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const floor = searchParams.get('floor');

    const where = floor ? { floor } : {};

    const snapshots = await db.snapshot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const formatted = snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      floor: s.floor,
      records: JSON.parse(s.records) as StockRecord[],
      createdAt: s.createdAt,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}

// POST: Create a snapshot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSnapshotSchema.parse(body);

    const snapshot = await db.snapshot.create({
      data: {
        name: parsed.name,
        floor: parsed.floor,
        records: JSON.stringify(parsed.records),
      },
    });

    return NextResponse.json(
      {
        id: snapshot.id,
        name: snapshot.name,
        floor: snapshot.floor,
        records: JSON.parse(snapshot.records) as StockRecord[],
        createdAt: snapshot.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot' },
      { status: 500 }
    );
  }
}
