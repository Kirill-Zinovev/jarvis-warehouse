# Task 2 - fullstack-developer

## Summary
Built the core backend infrastructure for the warehouse analytics app:

### Files Created
1. **`src/lib/analytics.ts`** - Analytics utility library with 10 exported functions
2. **`src/store/warehouse-store.ts`** - Zustand client-side state store
3. **`src/app/api/stock/route.ts`** - Stock records collection API (GET/POST/DELETE)
4. **`src/app/api/stock/[id]/route.ts`** - Single stock record API (GET/PUT/DELETE)
5. **`src/app/api/snapshots/route.ts`** - Snapshots collection API (GET/POST)
6. **`src/app/api/snapshots/[id]/route.ts`** - Single snapshot API (GET/DELETE)

### Key Decisions
- Zod v4 imported as `import { z } from 'zod/v4'` (matches installed v4.3.5)
- Next.js 16 dynamic route params use `params: Promise<{ id: string }>` (async params)
- displayDate computed in API response layer, not stored in DB
- Linear regression implemented from scratch (no external dependency)
- Moving average uses variable window at edges (partial windows)
- Anomaly detection uses 2σ threshold on daily changes
