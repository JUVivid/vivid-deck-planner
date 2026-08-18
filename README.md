# Vivid Deck Planner

Internal deck design, material-order and customer-quoting tool for **Vivid
Outdoor Living**. 2D CAD-style planning: draw a deck footprint, get automatic
code-checked framing, decking layout, stairs (including wrap-around corner
steps), railing, a cost-optimized lumber order with a crew cut list — and a
customer-facing installed-price proposal.

## ⚠️ KEEP THIS REPOSITORY PRIVATE

This repo (and any JavaScript bundle built from it) contains **real company
numbers**: dealer price sheets and invoiced receipt costs
(`src/catalog/prices.ts`, `src/catalog/prices-live.ts`), labour rates and the
profit margin (`src/model/defaults.ts`), and open pricing notes
(`PRICES-NEEDED.md`). Anyone who can view the repo — or open dev-tools on a
publicly hosted copy — can read them. Host it privately (private repo +
access-controlled hosting), never on a public GitHub Pages URL.

The customer quote page itself shows only installed prices; the company
breakdown is hidden behind the rep-only "Internals" toggle and is never
printed.

## Running it

Node is expected at `C:\Users\julme\.nvm\versions\node\v24.16.0` (same install the
vivid-redesign site uses).

- **Easiest:** double-click `start-dev.bat`, then open http://localhost:5174
- Or from a terminal with Node on PATH: `npm install` once, then `npm run dev`
- Production build: `npm run build` → static files in `dist/` (host anywhere private)
- Tests: `npm test` · Typecheck: `npm run typecheck`

## How to use

1. **Draw** (D): click corners on the grid — segments lock to 45°, snap to the grid.
   Type a length like `12'6` and press **Enter** for exact segments. Enter (or click
   the first corner) closes the outline.
2. **Select** (V): click an **edge** and tick **Ledger** to mark the house wall —
   the program auto-frames everything (SYP, spacing from the decking, 2x10
   upgrades, flush girder when the cantilever is off; the rep's only framing
   knob is the 1'/2'/3' cantilever preset). Tick **Railing** / **Fascia** per
   edge. Drag corners/edges/tiers to reshape; double-click an edge to add a corner.
3. **Stairs** (S): click near any open edge, then drag the flight anywhere
   around the perimeter — magnets stick it to edge centers and corners, and
   sliding it across a corner wraps it (cascading steps, any corner angle,
   ≤30" rise). Width and landing are in the panel.
4. **Tiers**: “+ Tier” in the top bar to draw more platforms at different heights.
5. **Views**: Top is the working view; **N / S / E / W** show schematic elevations
   (posts, beams, footings & frost depth, railing, full stair projections).
6. **Materials** tab: live bill of materials with the lumber cut plan —
   **Download order (.csv)** saves the order + cut list as a real file.
7. **Customer Quote** (gold button): the client-facing proposal — one installed
   price per category, turn-key total, print/PDF. Company numbers stay behind
   the rep-only **Internals** toggle. Structural code checks run continuously
   underneath; a red review banner appears only if a design fails.

Projects autosave to the browser (localStorage). Use **File → Save as / Open** for named
versions and **Export project (.json)** to share a file between machines.

## TimberTech / AZEK product catalog (2026 guide)

Decking, railing and fasteners are catalog-driven from the **TimberTech & AZEK
Exteriors 2026 Product Guide** (pages 5–11, 16–36, and PRO-TAC on 37):

- `src/catalog/timbertech.ts` — every collection with real profiles (widths,
  thicknesses, grooved/square/T&G edges, stock lengths, per-profile color
  limits), 7 railing systems (top-rail shapes, heights, section lengths,
  baluster counts, post sizes), 5 fastening systems (gap each system produces,
  fasteners per joist crossing), and PRO-TAC roll sizes. No SKUs by design.
- `src/catalog/compat.ts` — the compatibility rules. Invalid combinations are
  disabled in the UI *and* auto-corrected if forced (imported files, etc.):
  hidden clips need grooved boards; SIDELoc is PVC-only; **Cortex ✕ Terrain**;
  drink rails need full-profile square-shouldered boards (never scalloped:
  Terrain, Terrain+, Prime, Prime+) and never pair with glass/open mid-rail;
  Trademark tops come in White/Matte White only; porch T&G gets no picture
  frames/breakers; Kona and wide/narrow/MAX profiles are square-shouldered only.
- **PRO-TAC joist tape is always in the material list** — sized from the frame:
  1.625"×65' for single joists/rim/blocking/stringers, 3.25"×65' for doubled
  joists and 2-ply beams, 4"×65' for 3-ply beams, 12"×25' for the ledger.
- The Hardware layer now draws fastener locations: top-mount screw pairs at
  every joist crossing (Cortex/TOPLoc, picture frames, breakers) and hidden
  clips at board edges (zoom in past ~13 px/ft).

**Reconciled against the manufacturer install guides** (composite + Advanced
PVC decking, EDGELoc, CONCEALoc, porch, Statement/Pinnacle/Classic-Composite/
Advantage/IRX rail guides, CableRail section, IRX vertical & horizontal cable,
drink rail, ADA, Secure Mount Post, PRO-TAC sell sheet):

- **Joist spacing**: 16" oc max (12" diagonal & commercial); **MAX 1.5" boards:
  24" oc (16" diagonal)** — enforced per profile.
- **Breaker (parting) boards & butt seams**: doubled joists required — drawn as
  twin members on the plan and counted in the BOM. PVC prefers breakers over
  butt joints; PVC butts install tight, composite butt gaps go by temperature
  (3/16" ≤32°F · 1/8" 33–74°F · 1/32" ≥75°F) — surfaced in Code Check.
- **Picture frames**: per the guide's substructure diagram, borders parallel to
  the joists get a **sistered end joist**; borders across the joists get a
  **blocking row under the border seam** — both drawn (tight-dash rows / twin
  joists) and counted.
- **Blocking**: solid rows between joists at max ~6' spacing (guide: 4'–6').
- **Cable railing is not ordered like railing**: CCS **CableRail by Feeney** =
  per-section tensioned runs (quick-connect + swivel fittings per cable per
  section, 9 cables @36", intermediates 1/2/3 per 6'/8'/10', cable cut from
  spools). **IRX horizontal cable** = cables run continuously through dedicated
  pre-drilled END / INLINE / 90° CORNER posts, one cable kit per cable per run
  (5'–60', can't be split), runs max 60', 1 intermediate support per opening,
  no panels. **IRX vertical cable** = panel kits + a tensioning support kit per
  panel. All of this is reflected in the material list and Code Check.
- **NC company standards**: frost depth 12", soil bearing 1500 psf — fixed,
  applied to every project (old saves are normalized on load).
- **Stock lengths** are no longer user-facing — orders always draw from the
  manufacturer's listed lengths for the selected profile.

Still verify per current price sheets: pack coverages, 42" CableRail hardware
quantities, IRX cable counts per height (set by post pre-drilling; modeled as
11 @ 36" / 14 @ 42"), and screw-color "closest match" mappings.

## What the engines do

| Module | Responsibility |
| --- | --- |
| `src/engine/autoframe.ts` | Company-standard auto-framing: SYP, spacing from the decking, 2x8→2x10 upgrade before extra beams, flush girder at zero cantilever |
| `src/engine/framing.ts` | Joist layout, zoned beam placement for L/T shapes, cantilever limits, posts, footing sizing (soil psf + tributary area), hangers/ties, blocking, per-joist support verification |
| `src/engine/decking.ts` | Board rows at 0°/45°/90°, picture frames (1–2 rings), auto breaker boards at stock-length limits (with doubled joists beneath), cut list |
| `src/engine/stairs.ts` + `perimeter.ts` | Riser/tread solving to 7¾" max, board-driven tread depth, positional wrap-around corner steps (a perimeter span that crosses a corner wraps it — any corner angle), guard/handrail triggers |
| `src/engine/railing.ts` | Rail runs minus stair openings, shared corner/stair posts, post/section/baluster counts, cable-rail ordering rules |
| `src/engine/compliance.ts` | Pass/warn/fail checks with IRC references (drives the review banner) |
| `src/engine/bom.ts` + `cutplan.ts` | SKU-merged order; cost-driven lumber cutting stock (pieces ≥8' buy 1:1 full-length, only sub-8' pieces pack; 8' yard minimum; no splicing ever) + crew cut list; hardware counts, concrete volume, CSV |
| `src/engine/pricing.ts` + `quote.ts` | Material costing (receipts > dealer book > retail estimates, dearer-wins), per-category installed customer pricing at true margin |
| `src/codes/tables.ts` | IRC 2021 R507.6 joist spans, R507.5 beam spans (2024 NC Residential Code basis), ledger fastening, decking span limits, yard stock lengths |

## Span-table & grade policy (important)

Tables assume **40 psf live / 10 psf dead, ground snow ≤ 40 psf, No. 2 grade**.
**Company rule: orders call for #1 Southern Pine, but every span is planned on
the No. 2 tables** — a yard that only stocks #2 may substitute, and the
structure must stand on whatever grade is on the truck. Never take #1 span
credit anywhere in this program. DF/Hem-Fir/SPF and Cedar groups are
conservative approximations — **verify against the locally adopted code before
ordering or building**, and confirm frost depth and soil bearing with the
local building department. This tool is a planning aid, not an engineered
design.

## Known limits / roadmap

- Joists run N–S or E–W only (decking can be diagonal; diagonal joists later)
- One ledger wall plane per tier (stepped houses get a warning, frame the step manually)
- Grade is assumed flat; heights are relative to grade
- Very irregular concave shapes: the picture-frame inset and zoned beams degrade
  gracefully with warnings — check the framing layer
- Lighting is a placeholder (needs the fixture catalog + rate)
- Not yet: hosted deployment with shared project storage, in-app pricing
  settings + quote snapshots, service-menu scopes (porch framing, underdecking,
  lattice, screening, gates), PDF permit packet, hot-tub load zones
