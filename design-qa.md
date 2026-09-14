# Design QA

## Comparison target

- Source visual truth: `C:\Users\Пользователь\.codex\generated_images\01a032bb-08a7-7b81-839a-7168fc9e497e\exec-944e2262-40e3-4112-b093-78e296e25b72.png` (Jarvis, variant 3) and `C:\Users\Пользователь\.codex\generated_images\01a032bb-08a7-7b81-839a-7168fc9e497e\exec-94c7331d-611d-4647-989e-ecb22e263fa8.png` (Pasha, variant 3).
- Implementation: `http://localhost:3000/`, rendered in the Codex in-app browser. Browser automation exposes the rendered screenshots in the QA run, but does not expose a writable screenshot path.
- Source dimensions: 1487 x 1058 px for each generated target.
- Implementation capture: 1023 x 900 CSS px, browser viewport capture, device scale factor 1. The source was used as a visual reference for layout and component geometry; browser chrome and raster density were excluded from the comparison.

## States and interactions tested

- Jarvis result state with `24141.xlsx` and the 1C export `выгрузка остатков 14.09.xls`; the result showed 5 articles, found and not-found statuses, and one article grouped across multiple boxes.
- Pasha deletion state with two PDF reports and a current Excel base; the result showed 144 rows to update, 263 deleted units, and one discrepancy.
- Root protocol switch Jarvis ↔ ПАША and Pasha’s internal mode switch.
- Multiple-PDF upload: each filename is rendered in its own bounded row and long names are truncated.
- Mapping controls, reset availability, table search affordance, and the Excel export action.
- Browser console checked after the flows: 0 error and warning entries.

## Full-view comparison evidence

- Both implementations use the selected variant 3 composition: a light warehouse ledger, persistent left protocol rail, compact top bar, rose active state, bordered work surfaces, and bounded result tables.
- The active protocol is visibly marked with a tinted row and left accent bar, matching the supplied switching screenshot while remaining readable on desktop and narrow layouts.
- Jarvis uses a two-column upload workflow and a compact result ledger. Pasha uses two bounded upload cards and keeps the multi-file report list inside the card.

## Focused-region comparison evidence

- Protocol rail: active/inactive Jarvis and ПАША states were visible together; the selected mode remained clear after switching.
- Upload card: two PDF rows remained inside the card, with independent truncation and status icons; the card width did not grow with the filenames.
- Result table: Jarvis displayed repeated rows for `CT0001.A8354` under separate boxes, while Pasha displayed per article/box OZ/WB totals and semantic statuses.
- Mapping controls: both workflows use the shared authored select primitive with keyboard-accessible combobox semantics.

## Findings

No actionable P0, P1, or P2 visual findings remain.

Acceptable intentional differences:

- The generated targets use sample English headings and fictional sample data; the product implementation keeps the operational Russian copy and live uploaded values.
- The browser capture is narrower than the generated 1487 px mockup; responsive wrapping and bounded scroll are intentional product behavior.
- The implementation uses the existing Jarvis logo asset and Lucide interface icons; no generated decorative raster asset was required by the selected target.

## Comparison history

1. Initial implementation review identified the need to keep the protocol switch in a persistent left rail and to bound uploaded filenames. Those changes were implemented before this final QA pass.
2. Final Jarvis and Pasha captures were reviewed after the changes at the same browser state used for the functional flow. No P0/P1/P2 findings remained, so no further visual fix iteration was required.

## Implementation checklist

- [x] Jarvis and Pasha variant 3 structure implemented.
- [x] Root protocol switching uses the requested left-rail pattern.
- [x] Multiple PDF filenames stay bounded and readable.
- [x] Jarvis multi-box articles remain visually grouped in the result ledger.
- [x] Pasha report and base cards preserve the existing parsing and export logic.
- [x] Typecheck, lint, build, premium audit, and browser flows completed.

final result: passed
