import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { StockRecord } from '@/types/stock';

// GET: Get a single snapshot
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const snapshot = await db.snapshot.findUnique({ where: { id } });

    if (!snapshot) {
      return NextResponse.json(
        { error: 'Snapshot not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: snapshot.id,
      name: snapshot.name,
      floor: snapshot.floor,
      records: JSON.parse(snapshot.records) as StockRecord[],
      createdAt: snapshot.createdAt,
    });
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshot' },
      { status: 500 }
    );
  }
}

// DELETE: Delete a snapshot
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.snapshot.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Snapshot not found' },
        { status: 404 }
      );
    }

    await db.snapshot.delete({ where: { id } });
    return NextResponse.json({ message: 'Snapshot deleted' });
  } catch (error) {
    console.error('Error deleting snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to delete snapshot' },
      { status: 500 }
    );
  }
}
