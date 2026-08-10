// Agent output is markdown (### headers, **bold**, bullet lists) but was
// being dumped as raw text with whitespace-pre-line, so it rendered with
// literal "###"/"**" characters instead of real formatting. DOMPurify is
// cheap insurance, not a response to a known exploit: prompts.ts's own
// guardrail already treats ad-sourced data reaching the LLM as untrusted
// input, so sanitizing what that content renders as is a small, matching
// precaution.
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ''))
}

/** Renders content as markdown, then wraps each issue's verbatim quote in
 * a hoverable <mark> — the critic's per-issue highlighting on the report
 * itself. Quotes are matched against the *rendered* text, not the raw
 * markdown, since the critic quotes prose, not markdown syntax. Built via
 * DOM APIs (not string concatenation), so `reason` only ever lands in an
 * attribute value, never re-parsed as HTML — no re-sanitization needed.
 * If a quote isn't found verbatim, that one issue is silently skipped —
 * this is a nice-to-have visualization layer, not something that should
 * break report rendering if the LLM didn't quote exactly. */
export function renderReportContent(content, issues = []) {
  const html = renderMarkdown(content)
  if (!issues || !issues.length) return html

  const container = document.createElement('div')
  container.innerHTML = html
  for (const issue of issues) {
    if (issue?.quote) highlightFirstMatch(container, issue.quote, issue.reason)
  }
  return container.innerHTML
}

function highlightFirstMatch(root, quote, reason) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    const idx = node.textContent.indexOf(quote)
    if (idx === -1) continue

    const before = node.textContent.slice(0, idx)
    const match = node.textContent.slice(idx, idx + quote.length)
    const after = node.textContent.slice(idx + quote.length)

    const mark = document.createElement('mark')
    mark.className = 'critic-highlight'
    mark.setAttribute('data-tooltip', reason || '')
    mark.textContent = match

    const parent = node.parentNode
    parent.insertBefore(document.createTextNode(before), node)
    parent.insertBefore(mark, node)
    parent.insertBefore(document.createTextNode(after), node)
    parent.removeChild(node)
    return
  }
}
