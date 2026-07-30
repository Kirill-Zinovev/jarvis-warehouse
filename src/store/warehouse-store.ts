import { create } from 'zustand';
import type { StockRecord, FloorId } from '@/types/stock';

interface WarehouseState {
  // All records for all floors
  records: StockRecord[];
  setRecords: (records: StockRecord[]) => void;

  // Current floor
  currentFloor: FloorId;
  setCurrentFloor: (floor: FloorId) => void;

  // Floor-specific computed records
  getFloorRecords: () => StockRecord[];

  // Settings (per-floor thresholds via localStorage key)
  criticalThreshold: number;
  setCriticalThreshold: (val: number) => void;
  showMovingAvg: boolean;
  setShowMovingAvg: (val: boolean) => void;

  // UI state
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  sortColumn: 'date' | 'quantity';
  sortAscending: boolean;
  setSort: (column: 'date' | 'quantity') => void;

  // Live share mode
  liveMode: boolean;
  liveShareCode: string | null;
  setLiveMode: (enabled: boolean, code: string | null) => void;
}

export const useWarehouseStore = create<WarehouseState>((set, get) => ({
  // Records
  records: [],
  setRecords: (records) => set({ records, editingId: null }),

  // Current floor
  currentFloor: '1',
  setCurrentFloor: (floor) => set({ currentFloor: floor, editingId: null }),

  // Floor-specific records (computed)
  getFloorRecords: () => {
    const state = get();
    return state.records
      .filter((r) => r.floor === state.currentFloor)
      .sort((a, b) => {
        const cmp =
          state.sortColumn === 'date'
            ? a.dateISO.localeCompare(b.dateISO)
            : a.quantity - b.quantity;
        return state.sortAscending ? cmp : -cmp;
      });
  },

  // Settings
  criticalThreshold: 100,
  setCriticalThreshold: (val) => set({ criticalThreshold: val }),
  showMovingAvg: true,
  setShowMovingAvg: (val) => set({ showMovingAvg: val }),

  // UI state
  editingId: null,
  setEditingId: (id) => set({ editingId: id }),
  sortColumn: 'date',
  sortAscending: true,
  setSort: (column) =>
    set((state) => {
      if (state.sortColumn === column) {
        return { sortAscending: !state.sortAscending };
      }
      return { sortColumn: column, sortAscending: true };
    }),

  // Live share mode
  liveMode: false,
  liveShareCode: null,
  setLiveMode: (enabled, code) => set({ liveMode: enabled, liveShareCode: code }),
}));
