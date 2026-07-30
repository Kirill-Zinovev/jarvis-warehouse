export interface StockRecord {
  id: string
  dateISO: string
  displayDate: string
  quantity: number
  floor: string
}

export type FloorId = '1' | '2'

export const FLOOR_LABELS: Record<FloorId, string> = {
  '1': 'Первый этаж',
  '2': 'Второй этаж',
}
