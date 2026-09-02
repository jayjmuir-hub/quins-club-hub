/**
 * After a failed submit, put the problem where the person is looking.
 *
 * Item 3 of the 2 Sep 2026 UX review. On the child form and the sign-up form
 * the alert renders at the TOP of a long sheet while Save is at the bottom,
 * so a parent tapped Save, the button flickered, and nothing visible
 * happened. The event form and player form do the opposite: the banner sits
 * at the foot saying "Fill in the highlighted fields" while the highlighted
 * field is fifteen fields up. Screen-reader users heard the banner and had
 * to hunt.
 *
 * The rule: prefer the first control marked `aria-invalid="true"` — that is
 * the thing to fix, and focusing it puts the keyboard there too; otherwise
 * the form's own error region, marked `data-reveal="problem"` and given
 * `tabIndex={-1}` so it can take focus; otherwise any `role="alert"`. The
 * marker exists because a long form can carry standing warnings that are
 * also alerts (a play-up notice, a contact warning) and the FIRST alert in
 * the DOM is not always the one that just fired. Scroll it to the middle of
 * the viewport, then focus without a second scroll.
 *
 * ⚠️ CALL IT FROM AN EFFECT KEYED ON THE ERROR STATE, not from the submit
 * handler: setError/setInvalid have not rendered yet inside the handler, so
 * the selector would find nothing. `useEffect(() => { if (error)
 * revealProblem(formRef.current) }, [error])` is the shape every form uses.
 *
 * jsdom has no scrollIntoView, and reduced-motion users get no smooth
 * scroll; both are handled here rather than at every call site.
 */
export function revealProblem(container) {
  if (!container) return null
  const target =
    container.querySelector('[aria-invalid="true"]') ??
    container.querySelector('[data-reveal="problem"]') ??
    container.querySelector('[role="alert"]')
  if (!target) return null
  if (typeof target.scrollIntoView === 'function') {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }
  if (typeof target.focus === 'function') target.focus({ preventScroll: true })
  return target
}
