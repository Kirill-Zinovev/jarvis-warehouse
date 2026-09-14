---
version: 1.0
name: "Jarvis Warehouse"
description: "Локальный рабочий инструмент для подбора коробов и списания OZ/WB в стиле цифровой складской ведомости."
colors:
  primary: "#E11D48"
  ink: "#10204A"
  muted: "#71819A"
  background: "#F7F9FC"
  surface: "#FFFFFF"
  border: "#DFE6EF"
  success: "#20AD70"
  warning: "#D7780D"
  info: "#2B73D2"
typography:
  sans:
    fontFamily: "Segoe UI, Arial, Helvetica, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
spacing:
  section-gap: "1.5rem"
  page-max: "80rem"
components:
  button: { }
  card: { }
  table: { }
  upload: { }
  navigation: { }
---

# Jarvis Warehouse Design System

## Overview

### Creative North Star

Jarvis is a digital warehouse ledger: the visual language comes from a clean dispatch sheet, a location label, and a well-organized picking list. The interface should feel calm and exact on a busy warehouse desk, with structure coming from alignment and rules rather than decoration.

### Product context and register

- **Audience and primary job:** Warehouse operators upload shipment plans, stock exports, and OZ/WB deletion reports, then produce a trustworthy list of boxes and quantities.
- **Target market(s) and evidence:** Russian warehouse workflow; evidence is the user-provided Russian files, labels, and operating requirements.
- **Locale(s) and language policy:** Russian UI and Russian number/date formatting. File content may contain Latin and Cyrillic article codes and box labels.
- **Usage scene:** Desktop or narrow laptop, repeated daily use, high information density, keyboard and mouse interaction.
- **Register:** Operational product UI, not a marketing page.
- **Memorable signature:** A slim protocol rail with a rose active marker, making Jarvis and ПАША feel like two views of one workspace.
- **Restraint:** No gradients, glass effects, oversized hero panels, fake analytics, or card-per-row decoration.
- **Anti-references:** Generic pink SaaS dashboards, gamer consoles, and spreadsheet clones with uncontrolled horizontal growth.
- **Token ownership/runtime mapping:** Runtime CSS is canonical in `src/app/globals.css`; this document mirrors the accepted values used by the shared app shell and workflow components.

## Colors

The page surface is `#F7F9FC` with white working surfaces. `#10204A` carries primary reading and navigation, `#71819A` carries secondary copy, and `#DFE6EF` provides stable structure. `#E11D48` is reserved for the active protocol marker and primary actions. `#20AD70`, `#D7780D`, and the rose error tint distinguish success, review, and discrepancy states; state is always paired with text or an icon.

## Typography

The product uses a Cyrillic-safe Segoe UI/Arial stack. Headings are heavy with tight tracking for a ledger-like title hierarchy; body copy stays at readable 14–16px sizes. Numeric table values use tabular figures where available. Labels use sentence case and direct Russian verbs.

## Layout

The desktop shell reserves a 216px protocol rail and gives the working canvas a max width of 80rem. The content uses an editorial two-column intake grid, a short workflow ribbon, and one wide scroll-owned result table. At narrow widths, the rail becomes a horizontal protocol switch and file panels stack. Important values remain accessible through truncation with full-value file names available in the file list.

## Elevation & Depth

Hierarchy is created with white surfaces, pale background contrast, borders, and spacing. Shadows are limited to the primary action. Blur, glass effects, and decorative elevation are not part of the system.

## Shapes

Controls and working surfaces use a restrained 6–12px radius family. File rows and table groups use 6px corners; the protocol active marker is a slim vertical rule. Avoid nested rounded cards when spacing and a divider provide enough separation.

## Components

### Foundational visual states

Default controls use white surfaces and slate borders. Hover adds a light slate tint; focus-visible uses a rose ring; active and selected states use a rose-tinted surface and text. Busy states preserve control geometry and use a visible spinner. Success, warning, and error states combine color with an icon and text.

### Buttons and actions

The primary action is rose with white text and one directional icon. Export and secondary actions are outlined. Reset and preview actions are quiet ghost buttons. Destructive or discrepancy actions are separated from the primary action and never rely on color alone.

### Navigation and data display

The protocol rail is the canonical owner for switching Jarvis and ПАША. The Pasha screen keeps its two internal workflows in a compact segmented switch. Results are rendered as one grouped ledger table with sticky headers, stable widths, location labels, and aligned numbers.

### Forms and overlays

Upload zones are keyboard-focusable buttons with drag-and-drop as an enhancement. Each selected file gets a bounded, truncated row with its name, row count, status, and replacement action. PDF batches show individual file names. Column mappings remain editable and use the shared select primitive.

### Iconography

Lucide icons are used at 16–20px for controls and 18–24px for status markers. Every icon-only control must have an accessible name; action buttons keep text labels visible in the primary workflow.

### Motion

Motion is short and functional: content fades or rises slightly when the workflow changes, while drag-over and focus states transition immediately. Reduced-motion users receive the same state changes without decorative animation.

### Content and data visualization

Copy names the user action: «Собрать данные», «Обновить базу», «Экспорт в Excel». Counts use `ru-RU` formatting. Location labels are `2 этаж` and `БОКС`; marketplace labels remain `Ozon` and `WB`.

## Do's and Don'ts

- **Do:** Make the path from file upload to result obvious at a glance.
- **Do:** Use the same active protocol rail and state vocabulary on both screens.
- **Don't:** Let a file name or mapping control expand the whole page unexpectedly.
- **Don't:** Use color as the only signal for a discrepancy, missing article, or selected mode.
