import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod/v4';

// Generate a short random code (8 chars, URL-safe)
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const createBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// POST: Create a new shared link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBodySchema.parse(body);

    // Check if user already has a link (we store one per app, latest wins)
    const existing = await db.sharedLink.findFirst({ orderBy: { createdAt: 'desc' } });

    if (existing) {
      // Update the existing link — just bump updatedAt so recipient knows data is fresh
      const updated = await db.sharedLink.update({
        where: { id: existing.id },
        data: {
          name: parsed.name || existing.name,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json({ code: updated.code, name: updated.name, updated: true });
    }

    const code = generateCode();
    const link = await db.sharedLink.create({
      data: {
        code,
        name: parsed.name || 'Общая ссылка',
      },
    });

    return NextResponse.json({ code: link.code, name: link.name, updated: false }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }
    console.error('Error creating shared link:', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
