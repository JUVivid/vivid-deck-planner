/** Trigger a real browser file download (lands in the user's Downloads folder). */
export function download(filename: string, text: string, mime = 'text/plain') {
  // CSVs get a UTF-8 BOM so Excel opens em-dashes / Ø / ½ correctly
  const body = mime === 'text/csv' ? '\uFEFF' + text : text
  const blob = new Blob([body], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Windows-safe filename from a project name. */
export function safeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'deck'
  )
}

/** "Sample — Maple St - material order 2026-08-18.csv" */
export function orderCsvFilename(projectName: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${safeFilename(projectName)} - material order ${stamp}.csv`
}
