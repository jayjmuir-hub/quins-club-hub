// A user-supplied URL is not safe to drop into an href or an img src as-is.
// A drill's source_url / diagram_url come from a plain <input type="url">,
// which validates only on native form submit and happily accepts a
// `javascript:` or `data:` scheme. Drills are shared across the club, so a
// stored `javascript:` link would run in another coach's session on click.
// Parse and allow only http(s); anything else — including an unparseable
// value — returns null so the caller can drop the link/image entirely.
export function safeHttpUrl(value) {
  if (!value || typeof value !== 'string') return null
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}
