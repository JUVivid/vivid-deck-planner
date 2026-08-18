/** Format decimal feet as feet-inches, e.g. 12.53 -> 12'-6 3/8" */
export function ftIn(feet: number, denom = 16): string {
  const neg = feet < 0
  let totalIn = Math.abs(feet) * 12
  // round to nearest 1/denom inch
  totalIn = Math.round(totalIn * denom) / denom
  let ft = Math.floor(totalIn / 12)
  let inch = totalIn - ft * 12
  if (inch >= 12 - 1e-9) {
    ft += 1
    inch = 0
  }
  const whole = Math.floor(inch + 1e-9)
  let frac = inch - whole
  let fracStr = ''
  if (frac > 1e-9) {
    let num = Math.round(frac * denom)
    let den = denom
    while (num % 2 === 0 && den % 2 === 0 && num > 0) {
      num /= 2
      den /= 2
    }
    fracStr = ` ${num}/${den}`
  }
  const inchStr = `${whole}${fracStr}"`
  return `${neg ? '-' : ''}${ft}'-${inchStr}`
}

/** Compact label: 12'-6" (nearest inch) */
export function ftInlabel(feet: number): string {
  return ftIn(feet, 1)
}

export function inches(feet: number): string {
  const v = Math.round(feet * 12 * 16) / 16
  return `${v}"`
}

/**
 * Parse a length string into decimal feet. Accepts:
 *  12 | 12.5 | 12' | 12'6 | 12'-6" | 12 ft 6 in | 12-6 | 6 1/2" | 30" | 12' 6 1/2"
 * Returns null if unparseable.
 */
export function parseLen(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null

  // pure inches: 30" | 6 1/2" | 6.5 in
  let m = s.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?\s*(?:"|in(?:ches)?)$/)
  if (m) {
    let v = parseFloat(m[1])
    if (m[2] && m[3]) v += parseInt(m[2]) / parseInt(m[3])
    return v / 12
  }

  // feet + optional inches (+ optional fraction)
  m = s.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:-|\s)?\s*(?:(\d+(?:\.\d+)?)\s*(?:(\d+)\s*\/\s*(\d+))?\s*(?:"|in(?:ches)?)?)?$/,
  )
  if (m && m[1] !== undefined) {
    const ft = parseFloat(m[1])
    let inch = 0
    if (m[2] !== undefined) inch = parseFloat(m[2])
    if (m[3] && m[4]) inch += parseInt(m[3]) / parseInt(m[4])
    if (inch >= 0 && inch < 12.0001) return ft + inch / 12
    return null
  }
  return null
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function fmtSqft(n: number): string {
  return `${Math.round(n * 10) / 10} sq ft`
}
