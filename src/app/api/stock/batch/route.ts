import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod/v4';

const batchRecordSchema = z.object({
  dateISO: z.string().min(1),
  quantity: z.number().int(),
  floor: z.string().default('1'),
});

const batchBodySchema = z.object({
  records: z.array(batchRecordSchema).min(1).max(500),
  replaceFloor: z.boolean().default(false),
});

// POST: Batch create stock records (always creates, never overwrites)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchBodySchema.parse(body);

    if (parsed.replaceFloor) {
      const floors = new Set(parsed.records.map(r => r.floor));
      for (const floor of floors) {
        await db.stockRecord.deleteMany({ where: { floor } });
      }
    }

    const results = await db.stockRecord.createMany({
      data: parsed.records.map(item => ({
        dateISO: item.dateISO,
        floor: item.floor,
        quantity: item.quantity,
      })),
    });

    return NextResponse.json({ imported: results.count }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Error batch importing stock records:', error);
    return NextResponse.json(
      { error: 'Failed to batch import' },
      { status: 500 }
    );
  }
}
