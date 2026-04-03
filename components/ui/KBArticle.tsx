// WHY: Renders KB fix text as a formatted article instead of raw text.
// Handles: **bold**, numbered lists, bullet points, newlines.
// No markdown library needed — KB content follows a predictable format from Gemini.

function renderFixText(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Empty line → spacing
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />)
      continue
    }

    // Numbered step: "1. Something" or "1. **Something**"
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
    if (numberedMatch) {
      elements.push(
        <div key={key++} className="flex gap-3 mt-2">
          <span className="text-accent font-semibold text-sm flex-shrink-0 w-6 text-right">{numberedMatch[1]}.</span>
          <span className="text-sm text-zinc-200 leading-relaxed">{formatInline(numberedMatch[2])}</span>
        </div>
      )
      continue
    }

    // Bullet point: "- Something" or "* Something" or "  - Something" (sub-bullet)
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/)
    if (bulletMatch) {
      const indent = line.search(/\S/) >= 4
      elements.push(
        <div key={key++} className={`flex gap-2 ${indent ? 'ml-9' : 'ml-6'} mt-1`}>
          <span className="text-zinc-500 flex-shrink-0 mt-1.5">
            <svg className="size-1.5 fill-current" viewBox="0 0 6 6"><circle cx="3" cy="3" r="3" /></svg>
          </span>
          <span className="text-sm text-zinc-300 leading-relaxed">{formatInline(bulletMatch[1])}</span>
        </div>
      )
      continue
    }

    // "Cause:" line — styled as a callout
    if (trimmed.startsWith('Cause:')) {
      elements.push(
        <div key={key++} className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mb-2">
          <p className="text-sm text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Cause: </span>
            {formatInline(trimmed.slice(6).trim())}
          </p>
        </div>
      )
      continue
    }

    // "Possible causes:" line — styled as amber callout (similar to Cause)
    if (trimmed.startsWith('Possible causes:')) {
      elements.push(
        <div key={key++} className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mb-1">
          <p className="text-sm text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Possible causes: </span>
            {formatInline(trimmed.slice(17).trim())}
          </p>
        </div>
      )
      continue
    }

    // "How we handle this:" line — styled as teal callout
    if (trimmed.startsWith('How we handle this:')) {
      elements.push(
        <div key={key++} className="bg-teal-500/10 border border-teal-500/20 rounded-lg px-3 py-2.5 mt-2">
          <p className="text-sm text-teal-200/90 leading-relaxed">
            <span className="font-semibold text-teal-300">How we handle this: </span>
            {formatInline(trimmed.slice(19).trim())}
          </p>
        </div>
      )
      continue
    }

    // "See also:" line — styled as a subtle reference link
    if (trimmed.startsWith('See also:')) {
      elements.push(
        <p key={key++} className="text-sm text-accent/80 mt-2 italic">
          {formatInline(trimmed)}
        </p>
      )
      continue
    }

    // "Note:" or "Warning:" or "Important:" line — styled as a note
    const noteMatch = trimmed.match(/^(Note|Warning|Important):\s*(.*)/)
    if (noteMatch) {
      elements.push(
        <div key={key++} className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2.5 mt-2">
          <p className="text-sm text-blue-200/90 leading-relaxed">
            <span className="font-semibold text-blue-300">{noteMatch[1]}: </span>
            {formatInline(noteMatch[2])}
          </p>
        </div>
      )
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-zinc-300 leading-relaxed">{formatInline(trimmed)}</p>
    )
  }

  return elements
}

// Inline formatting: **bold** and ***bold*** → <strong>
function formatInline(text: string): React.ReactNode {
  // Split on **..** patterns and bold them
  const parts = text.split(/(\*\*\*?[^*]+\*\*\*?)/g)
  return parts.map((part, i) => {
    const boldMatch = part.match(/^\*\*\*?([^*]+)\*\*\*?$/)
    if (boldMatch) {
      return <strong key={i} className="font-semibold text-white">{boldMatch[1]}</strong>
    }
    return part
  })
}

// Extract fix text from potentially JSON-wrapped content.
// Handles truncated/malformed JSON where the entire Gemini response was saved as fix.
function extractFix(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw

  // Try clean JSON.parse first
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed.fix) return parsed.fix
  } catch { /* JSON is malformed/truncated — manually extract below */ }

  // Manually walk the string to find "fix": "..." and extract the value
  const fixKey = trimmed.indexOf('"fix"')
  if (fixKey === -1) return raw

  const colon = trimmed.indexOf(':', fixKey + 5)
  if (colon === -1) return raw

  const openQuote = trimmed.indexOf('"', colon + 1)
  if (openQuote === -1) return raw

  // Walk char-by-char from the opening quote, handling escape sequences
  let result = ''
  for (let i = openQuote + 1; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && i + 1 < trimmed.length) {
      const next = trimmed[i + 1]
      if (next === 'n') { result += '\n'; i++; continue }
      if (next === '"') { result += '"'; i++; continue }
      if (next === '\\') { result += '\\'; i++; continue }
      result += next; i++; continue
    }
    if (ch === '"') break // closing quote — done
    result += ch
  }

  return result || raw
}

export default function KBArticle({ fix, imageUrls }: { fix: string; imageUrls?: string[] }) {
  return (
    <div className="space-y-0.5">
      {renderFixText(extractFix(fix))}
      {imageUrls && imageUrls.length > 0 && (
        <div className="pt-3 mt-3 border-t border-border">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Screenshots</p>
          <div className="flex gap-2 flex-wrap">
            {imageUrls.map((url, idx) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Screenshot ${idx + 1}`}
                  className="size-20 object-cover rounded-lg border border-border hover:border-accent transition-colors"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
