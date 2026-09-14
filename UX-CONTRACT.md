# UX Contract

## Product context

- Audience: Russian warehouse operators.
- Primary jobs: match shipment articles to warehouse boxes; subtract OZ/WB deletion reports from the current stock base.
- Target market(s): Russian warehouse operations.
- Active locales: Russian (`ru-RU`).
- Language/content register: Direct operational Russian; source article and box codes are preserved after normalization for matching.
- Timezone/calendar policy: Source file values are preserved; UI dates use the local workstation date.
- Accessibility target: WCAG 2.2 AA baseline.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Matching and box allocation | Current user requirements in thread | Current task decision | 2026-09-14 |
| 1C warehouse import | Current user-provided 1C export and requirements | Example data / current task decision | 2026-09-14 |
| OZ/WB merge and deletion | Current user requirements in thread | Current task decision | 2026-09-14 |
| Permission model | not provided | — | — |
| Deletion / retention | not provided; app produces a local export | — | — |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: Existing runtime CSS is canonical; `DESIGN.md` mirrors accepted values.
- Runtime design-system/token source: `src/app/globals.css` and shared UI primitives in `src/components/ui/`.
- Mapping/export/adapters: Tailwind v4 `@theme inline` plus `.jarvis-app` CSS tokens.
- Token drift gate: `git diff`, lint, typecheck, build, and visual browser inspection.
- Supported themes: Light operational theme; existing system dark variables remain available but the redesigned workflow is light-first.
- Design-context owner/review policy: Update this contract when the protocol rail or core workflow behavior changes.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | `src/components/ui/select.tsx` via the shared `ColumnSelect` adapter in Pasha and direct use in Jarvis | Shared primitive / screen behavior | authored | keyboard + popup |
| Form | Upload and mapping sections in `jarvis-page.tsx` and `pasha-page.tsx` | Current workflow | shipment / warehouse / deletion | browser flow |
| Scrollbar | `.jarvis-app` baseline in `src/app/globals.css` | Runtime CSS | table inner scroll | computed style + browser |
| Toast | `src/components/ui/sonner.tsx` / Sonner | Existing app primitive | success / warning / error | browser flow |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | white/rose hierarchy | light tint | visible rose ring | darker fill | opacity + no pointer | preserve dimensions | toast or inline text |
| Input | white with slate border | — | rose border/ring | — | — | — | text guidance |
| Search | visible clear when non-empty | — | rose border/ring | — | — | — | no-results message |
| Table/list | grouped rows and sticky header | row tint | native focus where interactive | — | — | — | status text + icon |

## Dataset navigation

- Admin tables: no server pagination; result tables own a bounded internal scroll region.
- URL state: transient local state; no backend or shareable result state exists.
- Empty/no-results/error/loading treatment: upload instructions, inline validation toast, and a clear empty-table message.
- Selection scope: no row selection or bulk mutation UI.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Upload/background job | file picker or drop zone | parsing state in handler | file row and mappings | success toast | preserve other screen state and show error toast | picker control remains available | Current task |
| Match / update | primary action | button disabled by browser handler | result ledger | success toast | missing mappings/files shown as guidance | result is visible below action | Current task |
| Search | typing in result toolbar | local filtering | filtered ledger | immediate | clear button restores all rows | input keeps focus | Current task |
| Export | Excel/CSV button | local workbook generation | browser download | success toast | source result remains intact | button remains available | Current task |
| Cancel/back | protocol rail or reset | immediate | selected mode / empty workflow | no confirmation for local reset | no destructive external mutation | selected protocol stays visible | Current task |

## Navigation and responsive behavior

- Route document title policy: `Jarvis — подбор коробов для отгрузки`.
- Breadcrumb/tab/route-state policy: protocol rail owns Jarvis/Pasha switching; Pasha's segmented switch owns its two processing modes.
- Sidebar/drawer transformation: 216px desktop rail becomes horizontal scrollable switch below the top bar on narrow widths.
- Responsive table strategy: genuine result tables keep horizontal overflow in a bounded scroll owner; key columns remain visible at desktop width.
- Truncation/full-value access: file names are truncated per row without changing the underlying value; filenames can be replaced from the same control.
- Focus restoration: protocol buttons and upload controls retain visible focus; no sticky element obscures the result table header.

## Overlays and feedback

- Dialog primitive: none in the core workflow.
- Toast placement/duration/deduplication: existing Sonner primitive; use for parsing, validation, and export feedback.
- Alert/banner scope and persistence: inline workflow guidance for missing files/mappings; table status is persistent until reset.
- Layer/z-index contract: sticky table header below application toasts.

## Async and resilience

- Mutation default: local, synchronous data transformation after file parsing.
- Idempotency and duplicate-submit policy: reset clears local inputs/results; primary action requires all mappings and files.
- Offline/read-stale/write behavior: all parsing and matching are local; no network data dependency.
- Long-running progress and return path: parsing large workbooks keeps the screen intact; result is shown when complete.
- Dialog/form preservation and retry after failure: errors do not clear successfully loaded files.

## Validation

- Schema/validation layer: explicit file/mapping checks in component handlers.
- Trigger timing: after file read and before match/export.
- Error summary/inline policy: toast plus nearby helper copy where the action is blocked.
- `noValidate`, first-invalid focus, duplicate-submit prevention: no HTML submit form; action buttons are guarded by `canRun` and explicit checks.

## Permission and clipboard

- Permission UI strategy: not applicable; no authentication or role model is implemented.

## Verification

- Required static commands: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Browser/device/locale/theme matrix: desktop and narrow viewport; Russian labels; empty, loaded, result, and error states.
- Accessibility checks: semantic buttons, visible focus, keyboard file-picker alternative, labeled search clear action.
- Canonical sibling flow: Jarvis upload/match flow is the sibling for Pasha upload/update flow.
