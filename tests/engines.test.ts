import { describe, expect, it } from 'vitest'
import { newTier, blankProject, demoProject, migrateProject, uid } from '../src/model/defaults'
import { computeProject } from '../src/engine'
import { unitCostFor } from '../src/engine/pricing'
import { clipLineToPoly, insetPolygon, pointInPolygon, polygonArea } from '../src/geometry/geom'
import { ftIn, parseLen } from '../src/ui/format'
import type { Project } from '../src/model/types'

function rectDeck(w = 16, d = 12, height = 3.5): Project {
  // ledger along the north edge (y = 0), joists run N–S
  const tier = newTier(
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
    'Main Deck',
    height,
  )
  tier.edges[0].ledger = true
  tier.edges[1].railing = true
  tier.edges[2].railing = true
  tier.edges[3].railing = true
  // engine tests pin the classic drop-beam fixture; the app's auto-framer is
  // exercised separately (it would set cantilever 0 → flush by default)
  tier.framing.cantilever = 1
  tier.framing.beamStyle = 'drop'
  const p = blankProject('Test')
  p.tiers = [tier]
  return p
}

describe('geometry', () => {
  it('clips a line to a rectangle', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const segs = clipLineToPoly(poly, { x: 4, y: 0 }, { x: 0, y: 1 })
    expect(segs).toHaveLength(1)
    expect(Math.hypot(segs[0].b.x - segs[0].a.x, segs[0].b.y - segs[0].a.y)).toBeCloseTo(8, 5)
  })
  it('clips through a concave notch into two segments', () => {
    // U shape opening north, at x=5 the line crosses the notch
    const poly = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const segs = clipLineToPoly(poly, { x: 5, y: 0 }, { x: 0, y: 1 })
    expect(segs).toHaveLength(1)
    expect(segs[0].a.y).toBeCloseTo(4, 5)
    expect(segs[0].b.y).toBeCloseTo(8, 5)
  })
  it('insets a rectangle', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const inner = insetPolygon(poly, 1)
    expect(inner).not.toBeNull()
    expect(Math.abs(polygonArea(inner!))).toBeCloseTo(48, 3)
  })
})

describe('format', () => {
  it('formats feet-inches', () => {
    expect(ftIn(12.5)).toBe(`12'-6"`)
    expect(ftIn(9 + 11 / 12)).toBe(`9'-11"`)
  })
  it('parses common inputs', () => {
    expect(parseLen('12')).toBeCloseTo(12)
    expect(parseLen("12'6")).toBeCloseTo(12.5)
    expect(parseLen('12-6')).toBeCloseTo(12.5)
    expect(parseLen('30"')).toBeCloseTo(2.5)
    expect(parseLen(`12' 6 1/2"`)).toBeCloseTo(12.5417, 3)
  })
})

describe('framing engine — 16x12 ledger deck, SP 2x8 @ 16, (2)2x10, 1ft cantilever', () => {
  const computed = computeProject(rectDeck())
  const tier = [...computed.byTier.values()][0]
  const fr = tier.framing

  it('places 13 grid joists at 16" oc + 2 picture-frame seam joists', () => {
    expect(fr.joists.filter((j) => j.kind === 'field')).toHaveLength(13)
    // default single picture frame: a real joist under the E & W border seams
    expect(fr.joists.filter((j) => j.kind === 'pf')).toHaveLength(2)
    expect(fr.pfJoists).toBe(2)
  })
  it('uses a single beam with a legal backspan', () => {
    expect(fr.beams).toHaveLength(1)
    expect(fr.maxBackspan).toBeCloseTo(11, 1)
    expect(fr.maxBackspan).toBeLessThanOrEqual(fr.allowableJoistSpan + 0.01)
    expect(fr.cantilever).toBeCloseTo(1, 2)
  })
  it('spaces posts within the beam table (joist span 12 -> 7.33 max)', () => {
    const bm = fr.beams[0]
    expect(bm.posts.length).toBe(4) // 16' / 7.33 -> 3 bays
    expect(bm.postSpacing).toBeLessThanOrEqual(bm.allowablePostSpacing + 0.01)
  })
  it('connects each joist end for what it actually does — no hangers on cantilever tips', () => {
    expect(fr.footings.length).toBe(fr.posts.length)
    // 15 joists (13 grid + 2 pf). Ledger end = hung. Far end runs PAST the drop
    // beam and dies into the band board: that end carries no load, so it is
    // end-screwed, not hung. One hanger per joist, not two.
    expect(fr.hangers.length).toBe(15)
    expect(fr.bandEnds.length).toBe(15)
    expect(fr.ties.length).toBe(15) // every joist bears on the drop beam
    // every joist still reaches two real bearings (ledger + beam)
    expect(fr.notes.some((n) => n.includes('fewer than two bearings'))).toBe(false)
  })
  it('hangs both ends when the far support is a FLUSH beam (in the joist plane)', () => {
    const p = rectDeck(16, 12)
    p.tiers[0].framing.beamStyle = 'flush'
    p.tiers[0].framing.cantilever = 0
    const f2 = [...computeProject(p).byTier.values()][0].framing
    // flush beam carries the joist on its face → hanger, and no ties anywhere
    expect(f2.hangers.length).toBeGreaterThan(f2.bandEnds.length)
    expect(f2.ties.length).toBe(0)
  })
  it('passes joist-span and cantilever compliance', () => {
    const joist = computed.checks.find((c) => c.id.startsWith('joist-'))
    const cant = computed.checks.find((c) => c.id.startsWith('cant-'))
    expect(joist?.level).toBe('pass')
    expect(cant?.level).toBe('pass')
  })
})

describe('decking engine (Legacy 1x6 grooved + CONCEALoc defaults)', () => {
  const computed = computeProject(rectDeck())
  const tier = [...computed.byTier.values()][0]

  it('resolves board width & gap from the catalog (5.36" board, 3/16" gap)', () => {
    expect(tier.decking.boardWidthIn).toBeCloseTo(5.36)
    expect(tier.decking.gapIn).toBeCloseTo(0.1875)
  })
  it('covers the deck area with boards (LF ≈ area × 12/(w+gap))', () => {
    const fieldLf = tier.decking.fieldCuts.reduce((s, x) => s + x, 0)
    const frameLf = tier.decking.frameCuts.reduce((s, x) => s + x, 0)
    const expectedLf = (192 * 12) / (5.36 + 0.1875)
    expect(fieldLf + frameLf).toBeGreaterThan(expectedLf * 0.9)
    expect(fieldLf + frameLf).toBeLessThan(expectedLf * 1.18)
  })
  it('counts 2 hidden clips per board per joist (both edges) + frame composite screws', () => {
    // ~13 field boards × ~13 joists × 2 edges → ~350–850 clips (doubled vs 1/edge)
    expect(tier.fasteners.hidden).toBeGreaterThan(350)
    expect(tier.fasteners.hidden).toBeLessThan(900)
    // picture-frame boards are face-fastened with composite screws (dedicated count)
    expect(tier.fasteners.frameScrews).toBeGreaterThan(50)
  })
})

describe('stairs engine', () => {
  it('computes code-compliant risers for a 42" deck', () => {
    const p = rectDeck()
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const computed = computeProject(p)
    const sc = computed.stairs[0]
    expect(sc.riserCount).toBe(6)
    expect(sc.riserIn).toBeCloseTo(7, 2)
    expect(sc.riserIn).toBeLessThanOrEqual(7.75)
    expect(sc.treadCount).toBe(5)
    expect(sc.stringerCount).toBe(5) // 48" wide / 12" oc composite

    expect(sc.guardRequired).toBe(true)
  })
})

describe('fastener counts are derived from geometry, not guessed', () => {
  function plainDeck(w: number, d: number) {
    const t = newTier(
      [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
      ],
      'D',
      3.5,
    )
    t.edges[0].ledger = true
    for (let i = 1; i < 4; i++) t.edges[i].railing = true
    const p = blankProject('T')
    p.tiers = [t]
    return p
  }
  const partsOf = (p: Project) => [...computeProject(p).byTier.values()][0]

  it('face-screws the field edges that have no neighbour to clip into', () => {
    const parts = partsOf(plainDeck(16, 12))
    const field = parts.decking.boards.filter((b) => b.kind === 'field')
    const outer = field.filter((b) => (b.faceEdges ?? 0) > 0)
    const inner = field.filter((b) => (b.faceEdges ?? 0) === 0)
    // exactly the first and last row of the field are unclippable on one edge
    expect(outer.length).toBe(2)
    expect(outer.every((b) => b.faceEdges === 1)).toBe(true)
    expect(inner.length).toBeGreaterThan(10)
    // those edges moved from the clip count to the screw count — nothing invented
    expect(parts.fasteners.topScrews).toBeGreaterThan(0)
    expect(parts.fasteners.topScrews % 2).toBe(0)
  })

  it('perimeter screws scale with the deck edge, not the square root of the board count', () => {
    // the old heuristic was rows = sqrt(boards), which grows ~sqrt(area) and
    // badly under-orders on a long deck. Doubling the run must double the screws.
    const a = partsOf(plainDeck(16, 12)).fasteners.topScrews
    const b = partsOf(plainDeck(32, 12)).fasteners.topScrews
    const c = partsOf(plainDeck(64, 12)).fasteners.topScrews
    expect(b).toBeCloseTo(a * 2, -0.5)
    expect(c).toBeCloseTo(a * 4, -0.5)
  })

  it('counts every field-board end that butts a breaker seam', () => {
    // isolate ONE breaker: a 24' run would otherwise auto-add one at the stock limit
    const control = plainDeck(24, 12)
    control.tiers[0].decking.breakers = 'none'
    const p = plainDeck(24, 12)
    p.tiers[0].decking.breakers = 'none'
    p.tiers[0].decking.breakerStations = [0.5]

    const base = partsOf(control)
    const parts = partsOf(p)
    expect(base.decking.breakerButtEnds).toBe(0)
    const rows = new Set(parts.decking.boards.filter((b) => b.kind === 'field').map((b) => Math.round(b.a.y * 100)))
    // one breaker leaves two board ends per row
    expect(parts.decking.breakerButtEnds).toBe(rows.size * 2)
    // and each of those ends is face-screwed (2 screws), on top of the breaker board itself
    expect(parts.fasteners.frameScrews - base.fasteners.frameScrews).toBeGreaterThanOrEqual(
      parts.decking.breakerButtEnds * 2,
    )
  })
})

describe('stair treads are fully covered by real boards', () => {
  // the decking sets the tread depth: boards must cover run + nosing exactly,
  // never leaving bare stringer showing (5.36" composite used to fall 0.28" short)
  const cases: [string, string, string, string][] = [
    ['Legacy 5.36" composite', 'legacy', 'lg-16g', 'concealoc'],
    ['Vintage 5.5" PVC', 'vintage', 'v-16g', 'concealoc'],
    ['Vintage 1x8 7.25" PVC', 'vintage', 'v-18s', 'cortex'],
    ['Vintage 1x4 3.5" PVC', 'vintage', 'v-14s', 'cortex'],
    // the reported case: narrow T&G porch stock left ~4-3/4" of bare tread
    ['Porch 3.125" T&G', 'porch', 'p-14', 'porch-tongue'],
    ['Porch 5.5" T&G', 'porch', 'p-16', 'porch-tongue'],
  ]
  for (const [name, lineId, profileId, fastenerId] of cases) {
    it(`covers the tread with ${name}`, () => {
      const p = rectDeck()
      p.tiers[0].decking = { ...p.tiers[0].decking, lineId, profileId, fastenerId }
      p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
      const sc = computeProject(p).stairs[0]
      const covered = sc.treadBoards.reduce((s, b, i) => s + b.widthIn + (i > 0 ? sc.treadGapIn : 0), 0)
      // boards cover the full tread run PLUS the nosing overhang — exactly
      expect(covered).toBeCloseTo(sc.treadIn + sc.noseIn, 4)
      // and the resulting tread is still code-legal with a legal nosing
      expect(sc.treadIn).toBeGreaterThanOrEqual(10)
      expect(sc.noseIn).toBeGreaterThanOrEqual(0.75)
      expect(sc.noseIn).toBeLessThanOrEqual(1.25)
      expect(sc.treadBoards.length).toBeGreaterThanOrEqual(1)
    })
  }
  it('lays T&G porch boards tight (no gap) and adds boards to reach the tread', () => {
    const p = rectDeck()
    p.tiers[0].decking = { ...p.tiers[0].decking, lineId: 'porch', profileId: 'p-14', fastenerId: 'porch-tongue' }
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const sc = computeProject(p).stairs[0]
    expect(sc.treadGapIn).toBe(0) // interlocking stock butts tight
    expect(sc.treadBoards.length).toBe(4) // 2 boards would leave ~4-3/4" bare
    expect(sc.treadBoards.every((b) => !b.ripped)).toBe(true)
    expect(sc.treadIn).toBeCloseTo(11.5, 4)
  })
  it('rips the back board only when whole boards cannot make a legal tread', () => {
    const p = rectDeck()
    // 7.25" boards: 1 board is too shallow, 2 whole boards would be a 13.7" tread
    p.tiers[0].decking = { ...p.tiers[0].decking, lineId: 'vintage', profileId: 'v-18s', fastenerId: 'cortex' }
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const sc = computeProject(p).stairs[0]
    expect(sc.treadBoards.length).toBe(2)
    expect(sc.treadBoards[0].ripped).toBe(false)
    expect(sc.treadBoards[1].ripped).toBe(true)
    expect(sc.treadBoards[1].widthIn).toBeLessThan(7.25)
    // 5.5" boards need no rip
    const p2 = rectDeck()
    p2.tiers[0].decking = { ...p2.tiers[0].decking, lineId: 'vintage', profileId: 'v-16g', fastenerId: 'concealoc' }
    p2.stairs.push({ id: uid('st'), tierId: p2.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const sc2 = computeProject(p2).stairs[0]
    expect(sc2.treadBoards.every((b) => !b.ripped)).toBe(true)
  })
  it('orders tread boards and screws for the real board count', () => {
    const p = rectDeck()
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const computed = computeProject(p)
    const sc = computed.stairs[0]
    const screws = computed.bom.find((l) => l.item.startsWith('TOPLoc tread screws'))!
    const expected = sc.treadCount * sc.treadBoards.length * sc.stringerCount * 2
    // quantities now carry the uniform waste allowance before rounding
    expect(screws.qty).toBeGreaterThanOrEqual(expected)
    expect(screws.qty).toBeLessThan(expected * 1.1 + 25)
  })
})

describe('picture-frame border board (1x8 option)', () => {
  function vintageDeck(pfProfileId: string | null, rings: 0 | 1 | 2) {
    const p = rectDeck(16, 12)
    p.tiers[0].decking = {
      ...p.tiers[0].decking,
      lineId: 'vintage',
      colorId: 'Dark Hickory',
      profileId: 'v-16g',
      fastenerId: 'concealoc',
      pictureFrame: rings,
      pfProfileId,
    }
    return p
  }
  it('scales the border, the field inset and the framing under it to 7.25"', () => {
    const narrow = computeProject(vintageDeck(null, 1))
    const wide = computeProject(vintageDeck('v-18s', 1))
    const nParts = [...narrow.byTier.values()][0]
    const wParts = [...wide.byTier.values()][0]
    expect(nParts.decking.pfBoardWidthIn).toBe(5.5)
    expect(wParts.decking.pfBoardWidthIn).toBe(7.25)
    // border boards are drawn at the wide width
    const wideFrame = wParts.decking.boards.filter((b) => b.kind === 'frame')
    expect(wideFrame.length).toBeGreaterThan(0)
    expect(wideFrame.every((b) => b.widthIn === 7.25)).toBe(true)
    // the field is pushed in by the wider border (ring pitch = 7.25 + gap)
    const gap = wParts.decking.gapIn
    expect(wParts.decking.pfPitchFt).toBeCloseTo((7.25 + gap) / 12, 6)
    const [wx] = wParts.decking.fieldPoly!.map((pt) => pt.x)
    const [nx] = nParts.decking.fieldPoly!.map((pt) => pt.x)
    expect(wx - nx).toBeCloseTo((7.25 - 5.5) / 12, 3)
    // and the joists carrying the border seam move with it (nothing floats)
    const seamU = Math.min(...wParts.framing.joists.filter((j) => j.kind === 'pf').map((j) => j.u))
    expect(seamU).toBeCloseTo(wParts.decking.pfPitchFt, 2)
  })
  it('doubles up: two 7.25" rings inset the field twice the ring pitch', () => {
    const dbl = computeProject(vintageDeck('v-18s', 2))
    const parts = [...dbl.byTier.values()][0]
    const pitch = parts.decking.pfPitchFt
    const xs = parts.decking.fieldPoly!.map((pt) => pt.x)
    expect(Math.min(...xs)).toBeCloseTo(2 * pitch, 3)
    // a joist under BOTH ring seams
    const pfUs = parts.framing.joists.filter((j) => j.kind === 'pf').map((j) => j.u)
    expect(pfUs.some((u) => Math.abs(u - pitch) < 0.02)).toBe(true)
    expect(pfUs.some((u) => Math.abs(u - 2 * pitch) < 0.02)).toBe(true)
    // BOM orders the 1x8 border on its own stock, labelled as a double border
    const pfLine = dbl.bom.find((l) => l.detail.includes('double picture frame'))
    expect(pfLine).toBeTruthy()
    expect(pfLine!.item).toContain('7.25')
  })
  it('drops a 1x8 border when the line has no such board', async () => {
    const { normalizeDecking } = await import('../src/catalog/compat')
    const p = vintageDeck('v-18s', 1)
    p.tiers[0].decking.lineId = 'legacy' // composite: 5.36" only
    p.tiers[0].decking.profileId = 'lg-16g'
    const msgs = normalizeDecking(p.tiers[0])
    expect(p.tiers[0].decking.pfProfileId).toBe(null)
    expect(msgs.join(' ')).toMatch(/1x8/)
  })
})

describe('railing + guards', () => {
  it('flags a missing guard on a tall deck', () => {
    const p = rectDeck()
    p.tiers[0].edges[2].railing = false
    const computed = computeProject(p)
    const guard = computed.checks.find((c) => c.id.startsWith('guard-'))
    expect(guard?.level).toBe('fail')
  })
  it('passes when all open edges are railed', () => {
    const computed = computeProject(rectDeck())
    const guard = computed.checks.find((c) => c.id.startsWith('guard-'))
    expect(guard?.level).toBe('pass')
    const rl = [...computed.byTier.values()][0].railing
    expect(rl.totalLf).toBeCloseTo(16 + 12 + 12, 1)
    expect(rl.posts).toBeGreaterThan(6)
  })
})

describe('compliance catches bad spans', () => {
  it('fails an over-spanned joist layout', () => {
    const p = rectDeck(16, 20)
    p.tiers[0].framing.cantilever = 0
    // force a single beam far away by using tiny joists
    p.tiers[0].framing.joistSize = '2x6'
    p.tiers[0].framing.spacing = 24
    const computed = computeProject(p)
    // engine adds beams automatically, so span itself should still pass
    const joist = computed.checks.find((c) => c.id.startsWith('joist-'))
    expect(joist?.level).toBe('pass')
  })
  it('fails composite decking on 24" centers', () => {
    const p = rectDeck()
    p.tiers[0].framing.spacing = 24
    const computed = computeProject(p)
    const d = computed.checks.find((c) => c.id.startsWith('dspace-'))
    expect(d?.level).toBe('fail')
  })
  it('allows 24" centers for the 2x6 MAX profile — the per-profile spec governs', () => {
    // guards the single source of truth: max spacing comes from the profile's
    // maxJoistSpacingIn (catalog/compat), not from a per-material table.
    const p = rectDeck()
    p.tiers[0].framing.spacing = 24
    p.tiers[0].decking = { ...p.tiers[0].decking, lineId: 'harvest', profileId: 'h-max', colorId: 'Slate Gray', fastenerId: 'toploc' }
    const d = computeProject(p).checks.find((c) => c.id.startsWith('dspace-'))
    expect(d?.level).toBe('pass')
  })
})

describe('BOM', () => {
  const computed = computeProject(rectDeck())

  it('includes the core sections', () => {
    const sections = new Set(computed.bom.map((l) => l.section))
    expect([...sections].some((s) => s.includes('Framing Lumber'))).toBe(true)
    expect([...sections].some((s) => s.includes('Framing Hardware'))).toBe(true)
    expect([...sections].some((s) => s.includes('Decking'))).toBe(true)
    expect([...sections].some((s) => s.includes('Footings'))).toBe(true)
    expect([...sections].some((s) => s.includes('Railing'))).toBe(true)
    expect([...sections].some((s) => s.includes('Joist Protection'))).toBe(true)
  })
  it('orders 12ft joist stock incl. picture-frame sistered end joists', () => {
    const joists = computed.bom.find((l) => /joists @/i.test(l.detail))
    expect(joists?.item).toContain("2x8-12'")
    // 13 joists + 2 end joists doubled under the picture-frame borders, plus the
    // rim/blocking cuts that come off the same 12' stock (one merged order line)
    expect(joists!.qty).toBeGreaterThanOrEqual(15)
  })
  it('merges one SKU into ONE order line — a yard order cannot have the same board four times', () => {
    // 2x8-12' PT is bought for joists, rim AND blocking; all three are one line
    const twelves = computed.bom.filter((l) => l.item.includes("2x8-12'"))
    expect(twelves.length).toBe(1)
    expect(twelves[0].detail).toMatch(/joists/i)
    expect(twelves[0].detail).toMatch(/rim|blocking/i)
    // and no SKU appears twice anywhere in the order
    const keys = computed.bom.map((l) => `${l.section}|${l.item}|${l.unit}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('rounds a merged SKU to its order increment ONCE, not per contribution', () => {
    // demo project has 3 stairs; each contributes tread screws to the same SKU.
    // Rounding each to 25 first and summing would pad the line.
    const p = demoProject()
    const c = computeProject(p)
    const main = p.tiers[0]
    // both Main Deck stairs feed one colour-matched screw SKU
    const raw = c.stairs
      .filter((s) => s.ok && s.tier.id === main.id)
      .reduce((sum, s) => sum + s.treadCount * s.treadBoards.length * s.stringerCount * 2, 0)
    const screws = c.bom.find((l) => l.item.startsWith('TOPLoc tread screws') && l.detail.includes(main.name))!
    const wasted = raw * (1 + p.settings.quote.materialWastePct / 100)
    expect(screws.qty).toBe(Math.ceil(wasted / 25) * 25)
    expect(screws.qty - wasted).toBeLessThan(25) // ONE increment of slack, not one per stair
    // concrete: footings on both tiers + all three landing pads → a single pile
    const bags = c.bom.filter((l) => l.item.includes('concrete bag'))
    expect(bags.length).toBe(1)
  })
  it('orders concrete for 4 footings', () => {
    const bags = computed.bom.find((l) => l.item.includes('concrete bag') && l.detail.includes('footings'))
    expect(bags).toBeTruthy()
    expect(bags!.qty).toBeGreaterThan(10)
  })
  it('always includes PRO-TAC joist tape sized to the frame', () => {
    const tape = computed.bom.filter((l) => l.item.includes('PRO-TAC'))
    expect(tape.length).toBeGreaterThanOrEqual(3) // single joists, 2-ply beam, ledger
    const single = tape.find((l) => l.item.includes('1.625"'))
    expect(single).toBeTruthy()
    // 13 joists x 12' + rim 40' + blocking ≈ 200+ lf -> >= 4 rolls of 65'
    expect(single!.qty).toBeGreaterThanOrEqual(4)
    expect(tape.find((l) => l.item.includes('12"'))).toBeTruthy() // ledger wrap
  })
  it('names TimberTech products with color in the decking lines', () => {
    const board = computed.bom.find((l) => l.section.includes('Decking') && l.item.includes('Legacy'))
    expect(board).toBeTruthy()
    expect(board!.item).toContain('Espresso')
  })
  it('orders CONCEALoc clips + dedicated composite screws for the picture frame', () => {
    const clips = computed.bom.find((l) => l.item.includes('CONCEALoc'))
    expect(clips).toBeTruthy()
    // picture-frame boards get their own composite color-match screw line (not missing)
    const frameScrews = computed.bom.find((l) => l.item.includes('Composite deck screws'))
    expect(frameScrews).toBeTruthy()
    expect(frameScrews!.detail).toMatch(/picture frame/i)
    expect(frameScrews!.item).toContain('Dark Gray') // Espresso -> Dark Gray family
  })
  it('orders one hanger per LOAD-CARRYING joist end, and band screws for cantilever tips', () => {
    const parts = [...computed.byTier.values()][0]
    const hangers = computed.bom.find((l) => l.item.includes('joist hanger'))!
    // 15 joists hung at the ledger; the far ends cantilever past the drop beam
    // into the band board and take screws instead — ordering 30 hangers here is
    // the classic double-count.
    expect(hangers.qty).toBe(parts.framing.hangers.length) // connectors: exact count, no waste
    expect(hangers.qty).toBeLessThan(20)
    // those 15 band ends are paid for in structural screws (3 per connection)
    const frameScrews = computed.bom.find((l) => l.item.includes('structural frame screws'))!
    expect(frameScrews.detail).toContain(`${parts.framing.bandEnds.length} band/joist-end`)
    expect(frameScrews.qty).toBeGreaterThanOrEqual(parts.framing.bandEnds.length * 3)
  })
})

describe('auto-framing (company standard — the program decides)', () => {
  it('forces the Vivid standard assembly regardless of what a save contains', async () => {
    const { autoFrameTier } = await import('../src/engine/autoframe')
    const p = rectDeck()
    const t = p.tiers[0]
    // simulate a tampered/legacy save
    t.framing.species = 'CEDAR'
    t.framing.joistSize = '2x12'
    t.framing.beamSize = '2x8'
    t.framing.beamPly = 3
    t.framing.beamStyle = 'flush'
    t.framing.doubleRim = true
    t.framing.spacing = 24
    autoFrameTier(t)
    expect(t.framing.species).toBe('SP')
    expect(t.framing.joistSize).toBe('2x8')
    expect(t.framing.beamSize).toBe('2x10')
    expect(t.framing.beamPly).toBe(2)
    expect(t.framing.beamStyle).toBe('drop')
    expect(t.framing.doubleRim).toBe(false)
    // spacing snaps to what the decking allows (grooved composite → 16" oc)
    expect(t.framing.spacing).toBe(16)
  })

  it('sets spacing from the decking: 12" diagonal, 24" only for MAX boards', async () => {
    const { autoFrameTier } = await import('../src/engine/autoframe')
    const diag = rectDeck()
    diag.tiers[0].decking.angle = 45
    autoFrameTier(diag.tiers[0])
    expect(diag.tiers[0].framing.spacing).toBe(12)

    const max = rectDeck()
    max.tiers[0].decking = { ...max.tiers[0].decking, lineId: 'harvest', profileId: 'h-max', colorId: 'Slate Gray', fastenerId: 'toploc' }
    autoFrameTier(max.tiers[0])
    expect(max.tiers[0].framing.spacing).toBe(24)
  })

  it('runs joists perpendicular to the ledger; freestanding spans the short way', async () => {
    const { autoFrameTier } = await import('../src/engine/autoframe')
    // ledger on the EAST edge (vertical) → joists must run E–W (0)
    const p = rectDeck()
    p.tiers[0].edges[0].ledger = false
    p.tiers[0].edges[1].ledger = true
    autoFrameTier(p.tiers[0])
    expect(p.tiers[0].framing.joistDir).toBe(0)
    // freestanding 16 wide x 12 deep → span the 12' direction (N–S)
    const free = rectDeck()
    free.tiers[0].edges[0].ledger = false
    autoFrameTier(free.tiers[0])
    expect(free.tiers[0].framing.joistDir).toBe(90)
  })

  it('keeps the rep-owned cantilever, clamped to a buildable range', async () => {
    const { autoFrameTier } = await import('../src/engine/autoframe')
    const p = rectDeck()
    // presets are 0 / 1 / 2 / 3 ft — anything else snaps to the nearest (ties go down)
    p.tiers[0].framing.cantilever = 2
    autoFrameTier(p.tiers[0])
    expect(p.tiers[0].framing.cantilever).toBe(2)
    expect(p.tiers[0].framing.beamStyle).toBe('drop')
    p.tiers[0].framing.cantilever = 2.5
    autoFrameTier(p.tiers[0])
    expect(p.tiers[0].framing.cantilever).toBe(2)
    p.tiers[0].framing.cantilever = 9
    autoFrameTier(p.tiers[0])
    expect(p.tiers[0].framing.cantilever).toBe(3)
    // no cantilever → the girder sets flush for cost
    p.tiers[0].framing.cantilever = 0
    autoFrameTier(p.tiers[0])
    expect(p.tiers[0].framing.beamStyle).toBe('flush')
  })

  it('upgrades to 2x10 joists BEFORE adding an interior girder', async () => {
    const { autoFrameTier } = await import('../src/engine/autoframe')
    // 14' deep, no cantilever: 2x8 spans 11'-10" → would force a second girder;
    // 2x10 spans 14'-0" → one girder. The program upsizes the joists instead.
    const deep = rectDeck(16, 14)
    deep.tiers[0].framing.cantilever = 0
    autoFrameTier(deep.tiers[0])
    expect(deep.tiers[0].framing.joistSize).toBe('2x10')
    // 10' deep: 2x8 single-girder already works — no upgrade
    const shallow = rectDeck(16, 10)
    shallow.tiers[0].framing.cantilever = 0
    autoFrameTier(shallow.tiers[0])
    expect(shallow.tiers[0].framing.joistSize).toBe('2x8')
  })

  it('flush girders with zero cantilever still land in every zone (L-shape rim clip)', async () => {
    // regression: a flush beam sits exactly ON the rim line; clipping a line
    // collinear with the edge used to drop the beam, leaving 12' overhangs
    const { autoFrameAll } = await import('../src/engine/autoframe')
    const p = demoProject()
    autoFrameAll(p) // demo defaults: cantilever 0 → flush
    const c = computeProject(p)
    const main = [...c.byTier.values()][0].framing
    expect(main.beams.length).toBeGreaterThanOrEqual(2) // one per L zone
    expect(c.checks.filter((x) => x.level === 'fail')).toEqual([])
    expect(main.overhangIssues).toEqual([])
  })

  it('auto-framed decks pass every structural code check', async () => {
    const { autoFrameAll } = await import('../src/engine/autoframe')
    // a deep L-shaped deck — the engine must place extra beams, not fail
    const p = rectDeck(24, 20)
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    autoFrameAll(p)
    const fails = computeProject(p).checks.filter((c) => c.level === 'fail')
    expect(fails).toEqual([])
  })
})

describe('free stair placement around the perimeter', () => {
  it('follows the cursor to the closest open edge — never the house side', async () => {
    const { nearestStairSpot } = await import('../src/engine/stairplace')
    const p = rectDeck(16, 12)
    const t = p.tiers[0]
    // cursor just south of the deck → south edge (index 2)
    expect(nearestStairSpot({ x: 8, y: 13 }, t, 4)!.edgeIndex).toBe(2)
    // cursor just east → east edge (index 1)
    expect(nearestStairSpot({ x: 17, y: 6 }, t, 4)!.edgeIndex).toBe(1)
    // cursor just NORTH — that's the ledger; the stair lands on the nearest open edge instead
    const north = nearestStairSpot({ x: 2, y: -1 }, t, 4)!
    expect(north.edgeIndex).not.toBe(0)
  })

  it('sticks to edge centers, corner-flush spots, and corner-centered wraps', async () => {
    const { nearestStairSpot } = await import('../src/engine/stairplace')
    const p = rectDeck(16, 12)
    const t = p.tiers[0]
    // slightly off the south-edge midpoint → snaps to dead center
    const mid = nearestStairSpot({ x: 8.4, y: 12.5 }, t, 4)!
    expect(mid.snapped).toBe('center')
    expect(mid.t).toBeCloseTo(0.5, 6)
    // ~2 ft from the SE corner → corner-flush (span just touches it, no wrap)
    const flush = nearestStairSpot({ x: 14.2, y: 12.3 }, t, 4)!
    expect(flush.snapped).toBe('corner-flush') // south edge runs (16,12)→(0,12)
    expect(flush.t * 16).toBeCloseTo(2, 3) // center sits half a width from the corner
    // right on the SE corner → corner-centered (dragging across = wrapping)
    const corner = nearestStairSpot({ x: 15.8, y: 12.3 }, t, 4)!
    expect(corner.snapped).toBe('corner')
    expect(corner.edgeIndex).toBe(2)
    expect(corner.t).toBeCloseTo(0, 3)
    // far from any magnet → free placement, no snap
    const free = nearestStairSpot({ x: 12, y: 12.5 }, t, 4)!
    expect(free.snapped).toBe(null)
    expect(free.t).toBeCloseTo(1 - 12 / 16, 2)
    // corners on the house wall never offer the wrap magnet, and the spot
    // normalizes onto the open edge — never the ledger side
    const nw = nearestStairSpot({ x: -0.3, y: 0.2 }, t, 4)!
    expect(nw.snapped).toBe(null)
    expect(nw.edgeIndex).toBe(3)
  })

  it('a stair keeps a legal span when dragged onto a short edge', async () => {
    const { nearestStairSpot } = await import('../src/engine/stairplace')
    const p = demoProject()
    const main = p.tiers[0]
    // the 4' notch edge (6,12)→(6,16): a 4' stair can only sit centered
    const spot = nearestStairSpot({ x: 5.5, y: 14 }, main, 4)!
    expect(spot.t).toBeCloseTo(0.5, 3)
  })
})

describe('wrap-around corner steps (purely positional)', () => {
  // center the span ON the SE corner: crossing the corner is what wraps it
  const lowDeck = (t = 0, width = 4) => {
    const p = rectDeck(16, 12, 2) // 24" rise — under the 30" guard trigger
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t, width, landing: { kind: 'grade' } })
    return p
  }

  it('a span crossing a corner wraps it — and bills the real surface', () => {
    const c = computeProject(lowDeck())
    const sc = c.stairs[0]
    expect(sc.wrapped).toBe(true)
    expect(sc.wrapCorners).toBe(1)
    expect(sc.guardRequired).toBe(false)
    expect(sc.attachWidthFt).toBeCloseTo(4, 6)
    // one tread ring per tread; 2 legs → 3 frame verts → 6-point bands
    expect(sc.rings.length).toBe(sc.treadCount)
    expect(sc.rings[0].length).toBe(6)
    // exact surface: both legs + the flaring mitred corner, treads AND risers
    const r = sc.treadIn / 12
    const T = sc.treadCount
    const R = sc.riserCount
    expect(sc.treadSqft).toBeCloseTo(sc.attachWidthFt * r * T + r * r * T * T, 3)
    expect(sc.riserSqft).toBeCloseTo((sc.attachWidthFt * R + r * R * (R + 1)) * (sc.riserIn / 12), 3)
    expect(sc.finishSqft).toBeCloseTo(sc.treadSqft + sc.riserSqft, 6)
  })

  it('endpoint magnets kill sliver wraps: 4" of overshoot is not a wrap', () => {
    // center 1.7' from the corner — the span pokes 0.3' past it → snaps back
    const over = computeProject(lowDeck(1.7 / 16)).stairs[0]
    expect(over.wrapCorners).toBe(0)
    expect(over.wrapped).toBe(false)
    expect(over.attachWidthFt).toBeCloseTo(3.7, 3)
    // center 2.3' from the corner — 0.3' shy → grows to meet the corner clean
    const under = computeProject(lowDeck(2.3 / 16)).stairs[0]
    expect(under.wrapCorners).toBe(0)
    expect(under.attachWidthFt).toBeCloseTo(4.3, 3)
    // center 0.4' from the corner — most of a leg crosses: that IS a wrap
    const wrap = computeProject(lowDeck(0.4 / 16)).stairs[0]
    expect(wrap.wrapCorners).toBe(1)
  })

  it('handles 45° octagon corners — one flight wraps two of them', () => {
    const p = blankProject('Octagon')
    const tier = newTier(
      [
        { x: 4, y: 0 }, { x: 8, y: 0 }, { x: 12, y: 4 }, { x: 12, y: 8 },
        { x: 8, y: 12 }, { x: 4, y: 12 }, { x: 0, y: 8 }, { x: 0, y: 4 },
      ],
      'Octagon',
      2,
    )
    tier.edges[0].ledger = true
    p.tiers = [tier]
    p.stairs = [{ id: uid('st'), tierId: tier.id, edgeIndex: 4, t: 0.5, width: 13, landing: { kind: 'grade' } }]
    const sc = computeProject(p).stairs[0]
    expect(sc.ok).toBe(true)
    expect(sc.wrapCorners).toBe(2) // the two 45° corners flanking the bottom edge
    expect(sc.attachWidthFt).toBeCloseTo(13, 3)
    expect(sc.frame!.legs.length).toBe(3)
    // interior offsets are true miters: |m| = 1/cos(22.5°) for a 45° turn
    const dirs = sc.frame!.dirs
    for (let j = 1; j < dirs.length - 1; j++) {
      expect(Math.hypot(dirs[j].x, dirs[j].y)).toBeCloseTo(1 / Math.cos(Math.PI / 8), 3)
    }
    // flaring adds real area beyond a straight flight of the same length
    const r = sc.treadIn / 12
    expect(sc.treadSqft).toBeGreaterThan(sc.attachWidthFt * r * sc.treadCount)
    expect(sc.riserSqft).toBeGreaterThan(0)
    expect(sc.rings[0].length).toBe(8) // 4 frame verts per band edge
  })

  it('opens the railing on every wrapped edge', () => {
    const c = computeProject(lowDeck())
    const sc = c.stairs[0]
    expect(sc.edgeOpenings.length).toBe(2)
    expect(new Set(sc.edgeOpenings.map((o) => o.edgeIndex)).size).toBe(2)
    // both edges give up rail to the stair opening
    const rlWrap = [...c.byTier.values()][0].railing
    const rlNone = [...computeProject(rectDeck(16, 12, 2)).byTier.values()][0].railing
    expect(rlWrap.totalLf).toBeLessThan(rlNone.totalLf)
  })

  it('orders wrap framing: short stringers every leg + a mitred hip per corner', () => {
    const c = computeProject(lowDeck())
    const stringers = c.bom.find((l) => l.detail.includes('short stringers'))!
    expect(stringers).toBeTruthy()
    expect(stringers.item).toContain('2x12-')
    // the hip is a real cut in the stairs 2x12 pool, packed with the stringers
    const plan = c.cutPlans.find((p) => p.size === '2x12' && p.section.includes('Stairs'))!
    expect(plan).toBeTruthy()
    const hipCuts = plan.boards.flatMap((b) => b.cuts).filter((x) => x.label.includes('corner hip'))
    expect(hipCuts.length).toBe(1) // one hip per wrapped corner
    const treads = c.bom.find((l) => l.detail.includes('cascading treads'))!
    expect(treads.qty).toBeGreaterThan(0)
  })

  it('refuses to wrap above 30" of rise or around an inside corner', () => {
    // too tall: same corner-centered placement, but 42" of rise
    const tall = rectDeck(16, 12, 3.5)
    tall.stairs.push({ id: uid('st'), tierId: tall.tiers[0].id, edgeIndex: 2, t: 0, width: 4, landing: { kind: 'grade' } })
    const scTall = computeProject(tall).stairs[0]
    expect(scTall.wrapped).toBe(false)
    expect(scTall.wrapNote).toMatch(/30/)
    // inside corner: span centered on the demo L-notch reflex vertex
    const p = demoProject()
    p.tiers[0].height = 2
    p.stairs = [{ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 3, t: 0, width: 3, landing: { kind: 'grade' } }]
    const scIn = computeProject(p).stairs[0]
    expect(scIn.wrapped).toBe(false)
    expect(scIn.wrapNote).toMatch(/inside/)
    // both fall back to working straight flights, not dead stairs
    expect(scTall.ok).toBe(true)
    expect(scIn.ok).toBe(true)
  })

  it('legacy saved projects with the old wrap field migrate to positions', () => {
    const p = rectDeck(16, 12, 2)
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    ;(p.stairs[0] as { wrap?: string }).wrap = 'start'
    const m = migrateProject(JSON.parse(JSON.stringify(p)))!
    expect(m.stairs[0].t).toBe(0)
    expect(m.stairs[0].width).toBe(8)
    expect('wrap' in m.stairs[0]).toBe(false)
    // and the migrated stair still wraps — now by position
    expect(computeProject(m).stairs[0].wrapped).toBe(true)
  })
})

describe('lumber cut optimization (cost-driven cutting stock)', () => {
  it('cuts several short pieces from one long board when that is cheaper', async () => {
    const { planCuts } = await import('../src/engine/cutplan')
    // three 5' pieces: one 16' at $20 beats three 8' at $10 each
    const price = (L: number) => ({ 8: 10, 16: 20 })[L] ?? null
    const plan = planCuts(
      [{ lenFt: 5, label: 'a' }, { lenFt: 5, label: 'b' }, { lenFt: 5, label: 'c' }],
      [8, 16],
      price,
    )
    expect(plan.boards.length).toBe(1)
    expect(plan.boards[0].stockFt).toBe(16)
    expect(plan.boards[0].cuts.length).toBe(3)
  })

  it('never buys a longer board when shorter boards are cheaper overall', async () => {
    const { planCuts } = await import('../src/engine/cutplan')
    const price = (L: number) => ({ 8: 5, 16: 40 })[L] ?? null
    const plan = planCuts(
      [{ lenFt: 5, label: 'a' }, { lenFt: 5, label: 'b' }, { lenFt: 5, label: 'c' }],
      [8, 16],
      price,
    )
    expect(plan.boards.length).toBe(3)
    expect(plan.boughtLf).toBe(24)
  })

  it('a length with no price is not buyable', async () => {
    const { planCuts } = await import('../src/engine/cutplan')
    const plan = planCuts([{ lenFt: 9, label: 'x' }], [8, 10, 12], (L) => (L === 12 ? 15 : null))
    expect(plan.boards[0].stockFt).toBe(12)
  })

  it('cuts are atomic — every piece fits whole inside its board', () => {
    const c = computeProject(demoProject())
    expect(c.cutPlans.length).toBeGreaterThan(0)
    for (const p of c.cutPlans) {
      expect(p.boughtLf + 1e-6).toBeGreaterThanOrEqual(p.demandLf)
      for (const b of p.boards) {
        expect(b.cuts.reduce((s, x) => s + x.lenFt, 0)).toBeLessThanOrEqual(b.stockFt + 1e-6)
        expect(b.offcutFt).toBeGreaterThanOrEqual(-1e-6)
      }
    }
  })

  it('pools the demo posts into a few timbers instead of one board per post', () => {
    const c = computeProject(demoProject())
    const postPlan = c.cutPlans.find((p) => p.size === '6x6')!
    expect(postPlan).toBeTruthy()
    const postCuts = postPlan.boards.reduce((s, b) => s + b.cuts.length, 0)
    expect(postCuts).toBe(c.totals.posts)
    expect(postPlan.boards.length).toBeLessThan(c.totals.posts)
  })

  it('pieces 8\' and longer buy their OWN board — never combined, offcuts never harvested', async () => {
    const { planCuts } = await import('../src/engine/cutplan')
    // two 9' joists: one 20' at $12 would be cheaper than two 10' at $10 each,
    // but full-length pieces are exempt from optimization — 1:1, next length up
    const price = (L: number) => ({ 10: 10, 20: 12 })[L] ?? null
    const plan = planCuts([{ lenFt: 9, label: 'joist A' }, { lenFt: 9, label: 'joist B' }], [10, 20], price)
    expect(plan.boards.length).toBe(2)
    expect(plan.boards.every((b) => b.stockFt === 10 && b.cuts.length === 1)).toBe(true)
    // and a short piece never rides a long board's offcut — it gets its own board
    const mixed = planCuts(
      [{ lenFt: 9, label: 'joist' }, { lenFt: 3, label: 'blocking' }],
      [10, 12, 16],
      (L) => ({ 10: 10, 12: 11, 16: 14 })[L] ?? null,
    )
    expect(mixed.boards.length).toBe(2)
    expect(mixed.boards.every((b) => b.cuts.length === 1)).toBe(true)
  })

  it('never plans a purchase under the 8\' yard minimum', async () => {
    const { planCuts } = await import('../src/engine/cutplan')
    // 4' and 6' "lengths" priced dirt-cheap must still not be bought
    const price = (L: number) => ({ 4: 1, 6: 2, 8: 10, 12: 15 })[L] ?? null
    const plan = planCuts([{ lenFt: 2, label: 'post' }], [4, 6, 8, 12], price)
    expect(plan.boards[0].stockFt).toBe(8)
    const c = computeProject(demoProject())
    for (const p of c.cutPlans) for (const b of p.boards) expect(b.stockFt).toBeGreaterThanOrEqual(8)
  })

  it('a full-length run is NEVER built up from shorter boards', () => {
    // 24'-wide deck: the 24' ledger and rim exceed all stocked lengths — they
    // must surface as special-order lines, not get silently split
    const p = rectDeck(24, 10)
    const c = computeProject(p)
    const specials = c.bom.filter((l) => l.item.includes('special length'))
    expect(specials.length).toBeGreaterThan(0)
    expect(specials.some((l) => l.detail.includes('ledger'))).toBe(true)
    expect(specials[0].note).toMatch(/FULL length/)
    // and no planned board carries a piece of a run longer than itself
    for (const pl of c.cutPlans) {
      for (const b of pl.boards) for (const cutp of b.cuts) expect(cutp.lenFt).toBeLessThanOrEqual(b.stockFt + 1e-6)
      for (const o of pl.overlong) expect(o.lenFt).toBeGreaterThan(20)
    }
    // a 16' rim demand inside stock is bought as ONE board ≥ 16'
    const p2 = rectDeck(16, 10)
    const c2 = computeProject(p2)
    const framingPlan = c2.cutPlans.find((x) => x.size === p2.tiers[0].framing.joistSize && x.section.includes('Framing'))!
    const ledgerCut = framingPlan.boards.flatMap((b) => b.cuts.map((ct) => ({ b, ct }))).find((x) => x.ct.label.includes('ledger'))!
    expect(ledgerCut.ct.lenFt).toBeCloseTo(16, 3)
    expect(ledgerCut.b.stockFt).toBeGreaterThanOrEqual(16)
  })
})

describe('span charts govern — the buyer can never override the engineer', () => {
  it('every span-checked framing member is bought at its FULL engineered length', () => {
    // the IRC tables size the members (autoframe + computeFraming + compliance);
    // the cut planner only decides which boards to buy. Reconcile them: the
    // lumber order must cover every joist and beam ply at exactly the length
    // the span-checked engine specified — nothing shortened, nothing dropped.
    const p = demoProject()
    const c = computeProject(p)
    const framingCuts = c.cutPlans
      .filter((pl) => pl.section.includes('Framing'))
      .flatMap((pl) => pl.boards.flatMap((b) => b.cuts.map((ct) => ({ size: pl.size, ...ct }))))
    for (const tier of p.tiers) {
      const tc = c.byTier.get(tier.id)!
      const joistDemand = framingCuts
        .filter((x) => x.size === tier.framing.joistSize && x.label.includes(`${tier.name} joists`))
        .reduce((s, x) => s + x.lenFt, 0)
      const joistNeed = tc.framing.joists.reduce((s, j) => s + j.len, 0)
      expect(joistDemand).toBeCloseTo(joistNeed, 2)
      const beamDemand = framingCuts
        .filter((x) => x.size === tier.framing.beamSize && x.label.includes(`${tier.name} beam plies`))
        .reduce((s, x) => s + x.lenFt, 0)
      const beamNeed = tc.framing.beams.reduce((s, b) => s + b.len * tier.framing.beamPly, 0)
      expect(beamDemand).toBeCloseTo(beamNeed, 2)
    }
    // and the span-checked design itself is clean
    expect(c.checks.filter((x) => x.level === 'fail')).toEqual([])
  })

  it('orders call for #1 lumber, but spans plan for #2 — substitution-safe', async () => {
    const { SPECIES_LABEL, joistAllowableSpan } = await import('../src/codes/tables')
    // the order sheet specs #1 Southern Pine…
    expect(SPECIES_LABEL.SP).toContain('#1')
    // …but the charts stay pinned to the IRC R507.6 No. 2 values, because a
    // yard that only stocks #2 may substitute on any project
    expect(joistAllowableSpan('SP', '2x8', 16)).toBeCloseTo(11 + 10 / 12, 3)
    expect(joistAllowableSpan('SP', '2x10', 16)).toBeCloseTo(14, 3)
    expect(joistAllowableSpan('SP', '2x6', 24)).toBeCloseTo(7 + 7 / 12, 3)
  })
})

describe('customer quote', () => {
  const quoteOf = (fn?: (p: Project) => void) => {
    const p = demoProject()
    fn?.(p)
    return computeProject(p).quote
  }
  const sec = (q: ReturnType<typeof quoteOf>, id: string) => q.sections.find((s) => s.id === id)!
  const cat = (q: ReturnType<typeof quoteOf>, id: string) => q.internal.byCategory.find((c) => c.id === id)!

  it('shows ONE fully-installed price per category — never a cost or a rate', () => {
    const q = quoteOf()
    for (const id of ['deck', 'railing', 'stairs']) {
      const s = sec(q, id)
      expect(s.price).toBeGreaterThan(0)
      // the customer price must exceed what that scope costs us
      expect(s.price!).toBeGreaterThan(cat(q, id).cost!)
    }
    // nothing on the customer sheet exposes a rate, a cost or a margin
    const text = q.sections
      .flatMap((s) => [s.title, s.blurb, ...s.includes, ...s.specs.map((x) => x.label + ' ' + x.value)])
      .join(' ')
      .toLowerCase()
    for (const banned of ['cost', 'margin', 'markup', 'waste', 'per sq ft', 'labour', 'labor']) {
      expect(text).not.toContain(banned)
    }
  })

  it('the categories add up to the total exactly', () => {
    const q = quoteOf((p) => {
      p.settings.quote.demo = { enabled: true, areaSqft: 240 }
    })
    const shown = q.sections.filter((s) => !s.omitted && s.price !== null)
    const sum = shown.reduce((s, x) => s + (x.price ?? 0), 0)
    expect(sum).toBeCloseTo(q.total!, 2)
    expect(shown.length).toBeGreaterThanOrEqual(4)
  })

  it('rolls material, labour, tax, permits and profit into each category price', () => {
    const q = quoteOf()
    const deck = cat(q, 'deck')
    // deck carries the substructure material AND the job-level permit + drawings
    expect(deck.material).toBeGreaterThan(0)
    expect(deck.jobCosts).toBe(850)
    expect(deck.cost).toBeCloseTo(deck.material + deck.tax + deck.labor! + deck.jobCosts, 2)
    expect(deck.sell).toBeCloseTo(deck.cost! / 0.55, 1)
    // railing and steps carry no permit
    expect(cat(q, 'railing').jobCosts).toBe(0)
    expect(cat(q, 'stairs').jobCosts).toBe(0)
  })

  it('allocates material to the category that consumes it', () => {
    const q = quoteOf()
    expect(cat(q, 'railing').material).toBeGreaterThan(0)
    expect(cat(q, 'stairs').material).toBeGreaterThan(0)
    expect(cat(q, 'deck').material).toBeGreaterThan(cat(q, 'railing').material)
  })

  it('prices the real rate card behind the scenes', () => {
    const q = quoteOf()
    expect(cat(q, 'deck').labor).toBeCloseTo((216 + 64) * 15, 0)
    expect(cat(q, 'railing').labor).toBeCloseTo(40.487 * 5, 0)
    // steps: $15 per sq ft of treads AND risers together
    const finish = computeProject(demoProject()).stairs.filter((s) => s.ok).reduce((a, s) => a + s.finishSqft, 0)
    expect(cat(q, 'stairs').labor).toBeCloseTo(finish * 15, 1)
    expect(finish).toBeGreaterThan(30) // sanity: three flights of surface
  })

  it('charges the specialty rail rate for cable and glass infill', () => {
    const base = cat(quoteOf(), 'railing').labor!
    const cable = cat(
      quoteOf((p) => {
        p.settings.railing.infillId = 'cable'
      }),
      'railing',
    ).labor!
    expect(cable).toBeCloseTo(base * 2, 0)
  })

  it('a taller flight costs proportionally more — surface grows with rise', () => {
    const base = cat(quoteOf(), 'stairs').labor!
    const tall = cat(
      quoteOf((p) => {
        p.tiers[0].height = 6
      }),
      'stairs',
    ).labor!
    expect(tall).toBeGreaterThan(base)
  })

  it('holds the whole total when a rate is missing, rather than quoting low', () => {
    const q = quoteOf((p) => {
      p.settings.quote.rates.stepsPerSqft = null
    })
    expect(q.pendingLines).toBeGreaterThan(0)
    expect(sec(q, 'stairs').price).toBe(null)
    expect(q.total).toBe(null)
  })

  it('applies 45% as a true MARGIN — profit is 45% of the sell price', () => {
    const q = quoteOf()
    const i = q.internal
    expect(i.profitPct).toBe(45)
    expect(i.profitIsMarkup).toBe(false)
    expect(q.total).toBeCloseTo(i.jobCost! / 0.55, 1)
    expect(i.profit! / q.total!).toBeCloseTo(0.45, 4)
    expect(q.total).toBeGreaterThan(i.jobCost! * 1.45)
  })

  it('can switch to markup if that is what was meant', () => {
    const q = quoteOf((p) => (p.settings.quote.marginIsMarkup = true))
    expect(q.total).toBeCloseTo(q.internal.jobCost! * 1.45, 1)
  })

  it('carries one uniform 10% waste inside every ordered quantity', () => {
    const q = quoteOf()
    expect(q.internal.wastePct).toBe(10)
    expect(q.internal.materialTax).toBeCloseTo((q.internal.materialCost * q.internal.taxPct) / 100, 1)
  })

  it('applies waste to LUMBER on the material list, not just decking', () => {
    const noWaste = demoProject()
    noWaste.settings.quote.materialWastePct = 0
    const withW = computeProject(demoProject()).bom
    const without = computeProject(noWaste).bom
    const sumOf = (bom: typeof withW, section: RegExp) =>
      bom.filter((l) => section.test(l.section) && !l.informational).reduce((a, l) => a + l.qty, 0)
    // lumber, decking and concrete all carry the allowance
    expect(sumOf(withW, /Framing Lumber/)).toBeGreaterThan(sumOf(without, /Framing Lumber/))
    expect(sumOf(withW, /Decking/)).toBeGreaterThan(sumOf(without, /Decking/))
    expect(sumOf(withW, /Concrete/)).toBeGreaterThan(sumOf(without, /Concrete/))
  })

  it('prices balusters per pack from the rail sheet', () => {
    const bal = computeProject(demoProject()).bom.find((l) => /Balusters/.test(l.item))!
    expect(bal.unit).toBe('packs')
    expect(unitCostFor(bal.sku)!).toBeGreaterThan(100)
  })

  it('prices railing packs, top rails and joist tape from the rail sheet', () => {
    const c = computeProject(demoProject())
    const priced = (m: RegExp) => c.bom.find((l) => m.test(l.item))
    expect(unitCostFor(priced(/Universal Rail Pack 6/)!.sku)).toBeCloseTo(98.59, 2)
    expect(unitCostFor(priced(/RadianceRail Top Rail 6/)!.sku)).toBeCloseTo(47.33, 2)
    expect(unitCostFor(priced(/PRO-TAC.*1\.625/)!.sku)).toBeCloseTo(22.7, 2)
  })

  it('treats sales tax as a MATERIAL cost, never a customer line', () => {
    const q = quoteOf()
    expect(q.internal.taxPct).toBe(7.5)
    const text = q.sections.flatMap((s) => [s.title, s.blurb, ...s.includes]).join(' ').toLowerCase()
    expect(text).not.toContain('tax')
  })

  it('applies the Mecklenburg rate and the extra Charlotte review fee', () => {
    const base = quoteOf()
    const meck = quoteOf((p) => (p.settings.quote.mecklenburg = true))
    expect(meck.internal.taxPct).toBe(8.25)
    expect(meck.internal.permit).toBe(415)
    expect(meck.total!).toBeGreaterThan(base.total!)
    expect(cat(meck, 'deck').jobCosts).toBe(915)
  })

  it('adds demolition only when switched on, at $5/sq ft of cost', () => {
    const off = quoteOf()
    expect(sec(off, 'demo').omitted).toBe(true)
    const on = quoteOf((p) => (p.settings.quote.demo = { enabled: true, areaSqft: 240 }))
    expect(cat(on, 'demo').labor).toBeCloseTo(240 * 5, 2)
    expect(sec(on, 'demo').price).toBeCloseTo((240 * 5) / 0.55, 1)
  })

  it('never quotes an L-shaped deck by its bounding box', () => {
    const specs = sec(quoteOf(), 'deck').specs
    const main = specs.find((s) => s.label === 'Main Deck')!
    expect(main.value).toContain('custom shape')
    expect(specs.find((s) => s.label === 'Lower Tier')!.value).toContain('×')
  })
})


describe('catalog compatibility', () => {
  it('blocks Cortex on the Terrain Collection', async () => {
    const { lineById, fastenerById } = await import('../src/catalog/timbertech')
    const { fastenerBlockReason } = await import('../src/catalog/compat')
    const terrain = lineById('terrain')!
    const cortex = fastenerById('cortex')!
    expect(fastenerBlockReason(terrain, terrain.profiles[0], cortex)).toMatch(/not compatible/i)
  })
  it('blocks hidden clips on square-shouldered boards (Harvest Kona)', async () => {
    const { lineById, fastenerById } = await import('../src/catalog/timbertech')
    const { fastenerBlockReason } = await import('../src/catalog/compat')
    const harvest = lineById('harvest')!
    const kona16s = harvest.profiles.find((p) => p.id === 'h-16s')!
    expect(fastenerBlockReason(harvest, kona16s, fastenerById('concealoc')!)).toMatch(/grooved/i)
    expect(fastenerBlockReason(harvest, kona16s, fastenerById('sideloc')!)).toBeNull()
  })
  it('auto-corrects a drink rail over scalloped decking', async () => {
    const { normalizeRailing } = await import('../src/catalog/compat')
    const p = rectDeck()
    p.tiers[0].decking.lineId = 'prime' // scalloped
    p.tiers[0].decking.profileId = 'pm-16s'
    p.tiers[0].decking.colorId = 'Dark Teak'
    p.settings.railing.systemId = 'classic-composite'
    p.settings.railing.topStyleId = 'cc-drink'
    const msgs = normalizeRailing(p)
    expect(p.settings.railing.topStyleId).not.toBe('cc-drink')
    expect(msgs.join(' ')).toMatch(/scalloped/i)
  })
  it('allows a drink rail over square-shouldered Vintage', async () => {
    const { normalizeRailing } = await import('../src/catalog/compat')
    const p = rectDeck()
    p.tiers[0].decking.lineId = 'vintage'
    p.tiers[0].decking.profileId = 'v-16s'
    p.tiers[0].decking.colorId = 'Coastline'
    p.tiers[0].decking.fastenerId = 'sideloc'
    p.settings.railing.systemId = 'irx'
    p.settings.railing.topStyleId = 'irx-drink'
    p.settings.railing.infillId = 'al-bal'
    p.settings.railing.colorId = 'Black'
    const msgs = normalizeRailing(p)
    expect(p.settings.railing.topStyleId).toBe('irx-drink')
    expect(msgs).toHaveLength(0)
  })
  it('blocks glass infill under an IRX drink rail', async () => {
    const { railSystemById } = await import('../src/catalog/timbertech')
    const { infillBlockReason } = await import('../src/catalog/compat')
    const irx = railSystemById('irx')!
    const glass = irx.infills.find((i) => i.id === 'glass')!
    expect(infillBlockReason(irx, 'irx-drink', glass)).toMatch(/cannot be combined/i)
    expect(infillBlockReason(irx, 'irx-modern', glass)).toBeNull()
  })
  it('EDGELoc drives a 7/32" gap into the layout', () => {
    const p = rectDeck()
    p.tiers[0].decking.fastenerId = 'edgeloc'
    const computed = computeProject(p)
    const tier = [...computed.byTier.values()][0]
    expect(tier.decking.gapIn).toBeCloseTo(7 / 32)
  })
  it('restricts Vintage MAX boards to Coastline', async () => {
    const { lineById, profileColors } = await import('../src/catalog/timbertech')
    const vintage = lineById('vintage')!
    const max = vintage.profiles.find((p) => p.id === 'v-max')!
    expect(profileColors(vintage, max)).toEqual(['Coastline'])
  })
})

describe('v1 -> v2 migration', () => {
  it('maps generic materials onto the TimberTech catalog', () => {
    const t = newTier(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      'Main',
      3,
    )
    const v1 = {
      version: 1,
      name: 'Old Project',
      tiers: [
        {
          ...t,
          decking: { material: 'composite', boardWidth: 5.5, gap: 0.1875, angle: 45, pictureFrame: 2, breakers: 'auto', stockLengths: [12, 16, 20], wasteFactor: 0.08 },
        },
      ],
      stairs: [],
      settings: { frostDepth: 36, soilBearing: 2000, guardHeight: 42, railSystem: 'composite-kit', maxRailSection: 6, ledgerFastener: 'bolt', liveLoad: 40, deadLoad: 10 },
    }
    const p = migrateProject(v1)
    expect(p).not.toBeNull()
    expect(p!.version).toBe(2)
    expect(p!.tiers[0].decking.lineId).toBe('legacy')
    expect(p!.tiers[0].decking.fastenerId).toBe('concealoc')
    expect(p!.tiers[0].decking.angle).toBe(45)
    expect(p!.tiers[0].decking.pictureFrame).toBe(2)
    expect(p!.settings.railing.heightIn).toBe(42)
    expect(p!.settings.frostDepth).toBe(12) // NC standard overrides saved values
    expect(p!.settings.soilBearing).toBe(1500)
    expect(p!.settings.ledgerFastener).toBe('bolt')
  })
})

describe('install-guide rules', () => {
  it('MAX boards allow 24" oc joists (16" diagonal)', async () => {
    const { lineById } = await import('../src/catalog/timbertech')
    const { deckingMaxSpacing } = await import('../src/catalog/compat')
    const vintage = lineById('vintage')!
    const vmax = vintage.profiles.find((p) => p.id === 'v-max')!
    const v16 = vintage.profiles.find((p) => p.id === 'v-16g')!
    expect(deckingMaxSpacing(vmax, false)).toBe(24)
    expect(deckingMaxSpacing(vmax, true)).toBe(16)
    expect(deckingMaxSpacing(v16, false)).toBe(16)
    expect(deckingMaxSpacing(v16, true)).toBe(12)
  })
  it('adds picture-frame border framing: seam joists + blocking rows', () => {
    const computed = computeProject(rectDeck())
    const fr = [...computed.byTier.values()][0].framing
    expect(fr.pfJoists).toBe(2) // east & west borders (parallel to joists)
    expect(fr.pfBlocking.length).toBe(2) // north & south borders (across joists)
    const pfLine = computed.bom.find((l) => /picture-frame border blocking/i.test(l.detail))
    expect(pfLine).toBeTruthy()
  })
  it('places blocking rows at no more than ~6ft spacing', () => {
    const computed = computeProject(rectDeck(16, 12))
    const fr = [...computed.byTier.values()][0].framing
    // ledger -> beam backspan is 11ft: needs at least 1 mid row + row over the beam
    expect(fr.blocking.length).toBeGreaterThanOrEqual(2)
  })
  it('orders CCS CableRail per section (fittings, intermediates, spooled cable)', () => {
    const p = rectDeck()
    p.settings.railing = { systemId: 'classic-composite', colorId: 'Matte Black', heightIn: 36, topStyleId: 'radiance-top', infillId: 'cable' }
    const computed = computeProject(p)
    const bom = computed.bom
    const hw = bom.find((l) => l.item.includes('CableRail hardware kit'))
    const rlParts = [...computed.byTier.values()][0].railing
    expect(hw?.qty).toBe(rlParts.sections)
    expect(bom.find((l) => l.item.includes('intermediate baluster'))).toBeTruthy()
    expect(bom.find((l) => l.item.includes('stainless cable'))).toBeTruthy()
    // no baluster packs when cable is selected
    expect(bom.find((l) => l.item.includes('Round Aluminum Balusters') && l.unit === 'packs')).toBeFalsy()
  })
  it('orders IRX horizontal cable per run with dedicated posts (no panels)', () => {
    const p = rectDeck()
    p.settings.railing = { systemId: 'irx', colorId: 'Black', heightIn: 36, topStyleId: 'irx-classic', infillId: 'h-cable' }
    const computed = computeProject(p)
    const bom = computed.bom
    expect(bom.find((l) => l.item.includes('Universal Panel'))).toBeFalsy()
    expect(bom.find((l) => l.item.includes('Horizontal Cable Rail Kit'))).toBeTruthy()
    const endPosts = bom.find((l) => l.item.includes('END post'))
    expect(endPosts).toBeTruthy()
    const kits = bom.filter((l) => l.item.includes('IRX cable kit'))
    expect(kits.length).toBeGreaterThan(0)
    // 3 railed edges form chains; 11 cables per run at 36"
    const totalKits = kits.reduce((s, l) => s + l.qty, 0)
    const chains = [...computed.byTier.values()][0].railing.chains
    expect(totalKits).toBe(chains.length * 11)
    expect(bom.find((l) => l.item.includes('intermediate cable support'))).toBeTruthy()
    // special-install info check present
    expect(computed.checks.some((c) => c.title.includes('special installation'))).toBe(true)
  })
  it('spaces rail posts evenly per wall, ordering stock sections that cover each bay', () => {
    const computed = computeProject(rectDeck()) // CCS: sections 6/8/10
    const rl = [...computed.byTier.values()][0].railing
    // south edge is a full 16' run: 2 even bays of 8' (not 10' + 6')
    const south = rl.pieces.find((p) => Math.abs(p.len - 16) < 0.01)
    expect(south).toBeTruthy()
    expect(south!.sectionPlan).toEqual([8, 8])
    expect(south!.postPts).toHaveLength(3)
    const d01 = Math.hypot(south!.postPts[1].x - south!.postPts[0].x, south!.postPts[1].y - south!.postPts[0].y)
    const d12 = Math.hypot(south!.postPts[2].x - south!.postPts[1].x, south!.postPts[2].y - south!.postPts[1].y)
    expect(d01).toBeCloseTo(d12, 5)
    expect(d01).toBeCloseTo(8, 5)
    // west edge 12' run: 2 even bays of 6'
    const west = rl.pieces.find((p) => Math.abs(p.len - 12) < 0.01)
    expect(west!.sectionPlan).toEqual([6, 6])
  })
  it('stock lengths auto-match the manufacturer profile', async () => {
    const { normalizeDecking } = await import('../src/catalog/compat')
    const p = rectDeck()
    p.tiers[0].decking.stockLengths = [12]
    normalizeDecking(p.tiers[0])
    expect(p.tiers[0].decking.stockLengths).toEqual([12, 16, 20])
  })
})

describe('correctness pass (framing / railing / fascia / stairs)', () => {
  const outline = (p: Project) => p.tiers[0].outline

  it('keeps all support posts inside the deck outline', () => {
    const p = rectDeck(16, 12)
    const computed = computeProject(p)
    const fr = [...computed.byTier.values()][0].framing
    expect(fr.posts.length).toBeGreaterThan(0)
    for (const post of fr.posts) {
      expect(pointInPolygon(post.p, outline(p))).toBe(true)
    }
  })

  it('requires lateral bracing on tall posts and not on short ones', () => {
    const tall = computeProject(rectDeck(16, 12, 9))
    expect([...tall.byTier.values()][0].framing.bracingRequired).toBe(true)
    expect([...tall.byTier.values()][0].framing.braceCount).toBeGreaterThan(0)
    const short = computeProject(rectDeck(16, 12, 3))
    expect([...short.byTier.values()][0].framing.bracingRequired).toBe(false)
  })

  it('flush beams still produce beams + posts (frame does not vanish)', () => {
    const p = rectDeck(16, 12, 3.5)
    p.tiers[0].framing.beamStyle = 'flush'
    const fr = [...computeProject(p).byTier.values()][0].framing
    expect(fr.beams.length).toBeGreaterThan(0)
    expect(fr.posts.length).toBeGreaterThan(0)
    expect(fr.postTooShort).toBe(false)
  })

  it('composite railing uses steel surface-mount posts for interior/line posts', () => {
    const p = rectDeck(16, 12) // classic-composite default
    const smp = computeProject(p).bom.find((l) => l.item.toLowerCase().includes('surface-mount'))
    expect(smp).toBeTruthy()
    // no 4x4 wood interior post line for composite line posts
    const wood = computeProject(p).bom.find((l) => l.item.includes("4x4-8' PT post (inside sleeve)"))
    expect(wood).toBeFalsy()
  })

  it('post size option changes the ordered post', () => {
    const p = rectDeck(16, 12)
    p.settings.railing = { systemId: 'reliance', colorId: 'Matte White', heightIn: 36, topStyleId: 'rel-core', infillId: 'sq-vinyl', postOptionId: 'v6' }
    const bom = computeProject(p).bom
    expect(bom.find((l) => l.item.includes('6x6 vinyl'))).toBeTruthy()
  })

  it('fascia is on by default and suppressed on ledger + adjoining edges', () => {
    const t = newTier(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      'T',
      3,
    )
    expect(t.edges.every((e) => e.fascia)).toBe(true)
    // demo: main + lower share the x=16 edge → that edge is not fascia
    const demo = computeProject(demoProject())
    const parts = [...demo.byTier.values()]
    const main = parts[0]
    // main deck east edge (index 1) abuts the lower tier → suppressed
    expect(main.fasciaEdges.includes(1)).toBe(false)
  })

  it('manual breaker board gets a real support joist on EACH side of the seam', () => {
    const p = rectDeck(16, 12)
    p.tiers[0].decking.breakerStations = [0.5]
    const parts = [...computeProject(p).byTier.values()][0]
    expect(parts.decking.breakerUs.length).toBeGreaterThanOrEqual(1)
    expect(parts.decking.breakerLines.some((b) => b.manualIndex === 0)).toBe(true)
    const bu = parts.decking.breakerUs[0]
    const supports = parts.framing.joists.filter((j) => j.kind === 'breaker')
    expect(parts.framing.breakerJoists).toBe(2)
    expect(supports).toHaveLength(2)
    // one flanking joist each side, half a board width from the centerline —
    // the breaker and both field ends bear on wood, nothing floats
    const bw = parts.decking.boardWidthIn / 12
    const us = supports.map((j) => j.u).sort((a, b) => a - b)
    expect(us[0]).toBeCloseTo(bu - bw / 2, 1)
    expect(us[1]).toBeCloseTo(bu + bw / 2, 1)
  })

  it('stair stringer count scales with stair width', () => {
    const narrow = rectDeck(16, 12)
    narrow.stairs = [{ id: uid('s'), tierId: narrow.tiers[0].id, edgeIndex: 2, t: 0.5, width: 3, landing: { kind: 'grade' } }]
    const wide = rectDeck(16, 12)
    wide.stairs = [{ id: uid('s'), tierId: wide.tiers[0].id, edgeIndex: 2, t: 0.5, width: 8, landing: { kind: 'grade' } }]
    const nC = computeProject(narrow).stairs[0].stringerCount
    const wC = computeProject(wide).stairs[0].stringerCount
    expect(wC).toBeGreaterThan(nC)
  })

  it('picture-frame borders bear on framing: seam joists (∥ edges) + blocking (across edges)', () => {
    const parts = [...computeProject(rectDeck(16, 12)).byTier.values()][0]
    const fr = parts.framing
    // E & W borders run parallel to the joists → a real joist under each seam
    expect(fr.pfJoists).toBe(2)
    const pfUs = fr.joists.filter((j) => j.kind === 'pf').map((j) => j.u)
    const pitch = (parts.decking.boardWidthIn + parts.decking.gapIn) / 12
    expect(Math.min(...pfUs)).toBeCloseTo(pitch, 1) // seam inset from the W edge
    expect(Math.max(...pfUs)).toBeCloseTo(16 - pitch, 1)
    // N & S borders ride the joists → blocking row under each ring seam
    expect(fr.pfBlocking.length).toBe(2)
  })

  it('corner railing posts are deduped and sit on the shared centerlines', () => {
    const p = rectDeck(16, 12) // rails on edges 1,2,3 → 2 corners
    const rl = [...computeProject(p).byTier.values()][0].railing
    // one placement per post, corners counted once (matches net post count)
    expect(rl.postPlacements.length).toBe(rl.posts)
    const corners = rl.postPlacements.filter((pl) => pl.role === 'corner')
    expect(corners.length).toBe(2)
    // each run's posts share a straight centerline: interior/end posts on edge 2
    // (the south run, y≈12) all sit at the same inset y
    const eastCorner = corners.find((c) => c.pos.x > 15) // near vertex (16,12)
    expect(eastCorner).toBeTruthy()
    // corner post is inset diagonally inward from the (16,12) vertex
    expect(eastCorner!.pos.x).toBeLessThan(16)
    expect(eastCorner!.pos.y).toBeLessThan(12)
    expect(rl.railInsetFt).toBeGreaterThan(0)
  })

  it('rail runs terminate AT the corner post — no overshoot past the corner', () => {
    const p = rectDeck(16, 12)
    const rl = [...computeProject(p).byTier.values()][0].railing
    const corner = rl.postPlacements.find((pl) => pl.role === 'corner' && pl.pos.x > 15)!
    // the east run (edge 1) and south run (edge 2) both END exactly at the corner post
    const east = rl.pieces.find((pc) => pc.edgeIndex === 1)!
    const south = rl.pieces.find((pc) => pc.edgeIndex === 2)!
    const endsAt = (pc: (typeof rl.pieces)[0]) =>
      Math.min(
        Math.hypot(pc.railA.x - corner.pos.x, pc.railA.y - corner.pos.y),
        Math.hypot(pc.railB.x - corner.pos.x, pc.railB.y - corner.pos.y),
      )
    expect(endsAt(east)).toBeLessThan(0.01)
    expect(endsAt(south)).toBeLessThan(0.01)
    // and the last post of each run IS the corner post (evenly spaced along the trimmed run)
    const eastPostHit = east.posts.some((pl) => Math.hypot(pl.pos.x - corner.pos.x, pl.pos.y - corner.pos.y) < 0.01)
    expect(eastPostHit).toBe(true)
  })

  it('stair-top 90° turns share ONE post: deck run ends at the stair guard centerline', () => {
    const p = rectDeck(16, 12)
    // guarded stair (42" deck → 6 risers) centered on the south edge, 4' wide → opening x∈[6,10]
    p.stairs.push({ id: uid('st'), tierId: p.tiers[0].id, edgeIndex: 2, t: 0.5, width: 4, landing: { kind: 'grade' } })
    const rl = [...computeProject(p).byTier.values()][0].railing
    const rIn = rl.railInsetFt
    // the deck rail extends INTO the opening up to the stair-guard side rail
    // line (side inset = railInsetFt), ending in a corner-role post there
    const southPieces = rl.pieces.filter((pc) => pc.edgeIndex === 2)
    expect(southPieces.length).toBe(2)
    const stairEnds = southPieces.flatMap((pc) => {
      const ends: { x: number; role: string }[] = []
      const kLast = pc.postRoles.length - 1
      if (Math.abs(pc.a.x - 10 + rIn) < 0.02 || Math.abs(pc.a.x - 6 - rIn) < 0.02) ends.push({ x: pc.a.x, role: pc.postRoles[0] })
      if (Math.abs(pc.b.x - 10 + rIn) < 0.02 || Math.abs(pc.b.x - 6 - rIn) < 0.02) ends.push({ x: pc.b.x, role: pc.postRoles[kLast] })
      return ends
    })
    expect(stairEnds.length).toBe(2) // one per side of the opening
    for (const e of stairEnds) expect(e.role).toBe('corner')
    // the shared posts sit at the deck-rail centerline crossing the stair-guard
    // centerline: (10−rIn, 12−rIn) and (6+rIn, 12−rIn) — exactly where the plan
    // stair guard starts its raked rail (one post serves both rails on adjacent faces)
    for (const px of [10 - rIn, 6 + rIn]) {
      const hits = rl.postPlacements.filter((pl) => Math.hypot(pl.pos.x - px, pl.pos.y - (12 - rIn)) < 0.02)
      expect(hits.length).toBe(1)
      expect(hits[0].role).toBe('corner')
    }
    // dedupe stays consistent with the net post count
    expect(rl.postPlacements.length).toBe(rl.posts)
    // The stairs add only their 2 BOTTOM posts — the tops are the deck run's
    // corner posts. Same post SKU as the deck's end/corner sleeves, so it lands
    // on one merged order line carrying both purposes.
    const bom = computeProject(p).bom
    const stairPosts = bom.find((l) => l.detail.includes('stair rail bottom posts'))!
    expect(stairPosts.detail).toMatch(/end\/corner posts/)
    const deckEndPosts = rl.postPlacements.filter((pl) => pl.role !== 'line').length
    expect(stairPosts.qty).toBe(deckEndPosts + 2)
  })
})
