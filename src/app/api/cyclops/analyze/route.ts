import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

/**
 * Extract box identifier from raw text.
 * Strips everything after the first comma or "—" dash.
 */
function extractBoxName(raw: string): string {
  const commaIdx = raw.indexOf(',')
  if (commaIdx > 0) return raw.slice(0, commaIdx).trim()
  const dashIdx = raw.indexOf('—')
  if (dashIdx > 0) return raw.slice(0, dashIdx).trim()
  return raw.trim()
}

const SYSTEM_PROMPT = `Ты — система распознавания складской информации с фото коробов/упаковок.

На складе каждый короб подписан. Формат подписи на коробе:
АРТИКУЛ, АДРЕС_КОРОБА, КОЛ-ВО_ВБ, КОЛ-ВО_ОЗОН

Примеры адресов коробов: 6ФА, МКО, АИ18, АК10, 4ФА-1э, 56na-1э, 1Д45, 1ЕГ и т.д.

ВАЖНО: На фото после номера короба может быть ЛИШНИЙ ТЕКСТ, например:
"1Д45, 1 этаж — удалено 1 шт"
"1ЕГ, 2 этаж — удалено 0 шт"
Этот текст нужно ИГНОРИРОВАТЬ. Извлекай ТОЛЬКО номер короба и количество.

С каждого фото/видео извлеки:
1. **article** — артикул товара (строка вида БУКВЫ.БУКВЫЦИФРЫ, например JB0010.A0224, CT0001.A7724, KS0002.A7692)
2. **box** — номер короба (строка, например "1Д45", "6ФА", "МКО", "АИ18") — только короткое название, БЕЗ приписок про этаж и удаление
3. **quantity** — ОБЩЕЕ количество = ВБ + Озон (СЛОЖИ оба числа в одно)

ПРАВИЛА:
- Артикул ВСЕГДА вида БУКВЫЦИФРЫ.БУКВЫЦИФРЫ (с точкой посередине)
- Номер короба — это короткий текст (2-6 символов). Если на фото "1Д45, 1 этаж — удалено 1 шт" → box = "1Д45"
- Если на фото видны ДВА числа после адреса — первое это ВБ, второе Озон. СЛОЖИ их в quantity.
- Если видно только ОДНО число — это quantity
- Если на фото несколько коробов/товаров — перечисли КАЖДЫЙ отдельной записью
- Если артикул нечитаемый — ПРОПУСТИ этот элемент (не угадывай)
- НЕ выдумывай данные, которых нет на фото
- quantity должно быть больше 0, иначе пропусти запись

ПРИМЕРЫ:
"JB0010.A0224, 6ФА, 1, 0" → {"article":"JB0010.A0224","box":"6ФА","quantity":1}
"CT0001.A7724, МКО, 0, 1" → {"article":"CT0001.A7724","box":"МКО","quantity":1}
"KS0002.A7692, АИ18, 3, 5" → {"article":"KS0002.A7692","box":"АИ18","quantity":8}

Ответ ТОЛЬКО в формате JSON массива, без markdown, без пояснений:
[{"article": "ARTICLE_CODE", "quantity": N, "box": "BOX_ID"}, ...]

Если не удалось распознать ни одной записи — верни пустой массив: []`

export async function POST(request: NextRequest) {
  try {
    const { image, fileName } = await request.json()

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'image is required' }, { status: 400 })
    }

    const zai = await ZAI.create()

    // The SDK exposes createVision at runtime, but its published TypeScript
    // declarations do not currently include the method.
    const visionCompletions = zai.chat.completions as typeof zai.chat.completions & {
      createVision: (payload: Record<string, unknown>) => Promise<{
        choices: Array<{ message?: { content?: string } }>
      }>
    }

    const response = await visionCompletions.createVision({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Извлеки данные с этого фото: артикул, номер короба, количество. Если видишь два числа (ВБ и Озон) — сложи их в одно quantity. Если у короба есть приписка про "этаж — удалено" — ИГНОРИРУЙ её. Ответь ТОЛЬКО JSON массивом.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const content = response.choices[0]?.message?.content || ''

    let items: Array<{ article: string; quantity: number; box?: string }> = []

    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    try {
      items = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (match) {
        items = JSON.parse(match[0])
      }
    }

    // Validate and sanitize
    const validItems = items
      .filter((item) => item.article && typeof item.article === 'string' && item.article.trim().length > 0)
      .map((item) => {
        const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0))

        // Clean box name: strip extra text like "1 этаж — удалено 1 шт"
        const rawBox = item.box ? String(item.box).trim() : undefined
        const cleanBox = rawBox ? extractBoxName(rawBox) : undefined

        return {
          article: String(item.article).trim(),
          quantity,
          box: cleanBox || undefined,
        }
      })
      .filter((item) => item.quantity > 0)

    return NextResponse.json({
      fileName: fileName || 'photo',
      items: validItems,
    })
  } catch (error) {
    console.error('Cyclops analyze error:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image', details: String(error) },
      { status: 500 }
    )
  }
}
