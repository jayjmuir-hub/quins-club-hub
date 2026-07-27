# SDD ledger — plan: docs/plans/quins-v1-mvp.md
Task 1: complete (commits 77244cb..f912aa2, review clean)
Task 1: minor (deferred): test:integration uses POSIX inline env syntax; not Windows-cmd portable
Task 1: controller fix (post-review, asset only): crest.png downscaled 895px->400px, crest-small.png removed
Task 2: controller ruling — anon client reading 0 teams is BY DESIGN. All RLS SELECT policies (teams, clubs, events, players) require a memberships row for auth.uid(). Plan's "expect 15" assumed a member context. Implementer's adjusted expectation stands.
Task 2: derived requirement for Tasks 7/8 — app must render an explicit "signed in, no membership yet / ask an admin for an invite" state, not an empty app.
Task 2: verified auth.users trigger on_auth_user_created -> handle_new_user() auto-creates the profiles row; no app-side profile creation needed.
Task 2: complete (commits 8c8c746..dba7ad6, review clean)
Task 2: controller fix (doc only): removed publishable key literal from docs/plans/quins-v1-mvp.md
Tasks 3+4: complete (commits a0d1e20..b901b99, review clean) — combined into one commit, same file
Tasks 3+4: minor (deferred): getSession() rejection swallowed with no console diagnostic (src/lib/auth.jsx:40-43)
Tasks 3+4: minor (deferred): no test for the unmount-before-resolve race the `mounted` guard exists for
Task 5: complete (commits b901b99..32f9b5d, review clean)
Task 5: minor (deferred): noValidate makes native validation semantic-only; no whitespace-only email test; "Use a different email" keeps stale value
Task 6: fix round 1/5 (1 addressed, 0 open — surfaced failed magic-link/OAuth errors on Login; commits c9eee27..546ae93)
Task 6: complete (commits 32f9b5d..546ae93, review clean)
Task 6: minor (deferred): Login.jsx:24-28 derives state from props via useEffect; safe only because RequireAuth never resets authError
Task 6: CARRY TO TASK 8 — RequireAuth.authError is never cleared for the app lifetime; after in-SPA sign-out, Login would resurface "That sign-in link didn't work". Task 8 introduces sign-out, so it must clear it.
Task 7: fix round 1/5 (commit 7c45d99 — canEditTeam null guard, sort_order NaN guard, roleLabel precedence tests). Fix landed and 79/79 tests pass, BUT the scoped re-review was NOT run before the session paused. RESUME HERE: run review-package 7c45d99 against ce0a758..7c45d99 and dispatch re-review-prompt before marking Task 7 complete.
SESSION PAUSED 27 Jul 2026 ~11:20 UTC. Work bundled to quins-club-hub.bundle + source zip, delivered to user and written to C:\Users\Jay\GitHub\ on device "cafnet". Handoff doc written to project as claude/Quins App — Build Handoff (session state).md
Task 7: fix round 1/5 re-review — all 6 findings ADDRESSED, 35/35 scope tests green, no new breakage
Task 7: complete (commits 546ae93..7c45d99, review clean)
Task 7: minor (deferred, process): task-7-report.md was never updated with the fix-round evidence (session interruption)
Task 8: fix round 1/5 (3 addressed: mobile role label + class-token test, error text quinsRedDark, tagline desktop size; commit 55dbb81)
Task 8: fix round 2/5 (1 addressed: crest was object-fit:fill flattening the 369x400 shield in a square badge; object-contain in AppShell + Login, alt + class-token regression tests; commit 08ea8ce)
Task 8: controller visual verification — rendered real components in Chromium at 375px and 1280px via a throwaway harness (harness/, gitignored). Confirmed: role label visible at both widths, bottom tab bar <820px / top nav >=820px never both, gradient renders, crest no longer clipped, no overflow, no console errors in 10 renders. Screenshots in screenshots/ (gitignored).
Task 8: complete (commits 7c45d99..08ea8ce, review clean)
Task 8: minor (deferred): mobile role span has truncate without min-w-0; long role strings may push width rather than ellipsis
Task 8: minor (deferred): "last row hidden behind tab bar" verified by geometry (40px clearance) not visually — recheck once a real screen has enough content (Task 11+)
Task 9: fix round 1/5 — Critical Sheet stale-onClose focus-steal bug (latest-ref pattern + regression test verified RED via git stash), neutral Chip/Badge contrast #77726e->#5c5854 (6.04:1, recomputed independently), .sheet-grip ported, desktop settle keyframe restored, Empty hover #D62A3D; commit 8b834ad
Task 9: fix round 1/5 re-review — all 6 findings ADDRESSED, no new breakage
Task 9: complete (commits b1d1a27..8b834ad, review clean)
Task 9: deferred (later hardening pass): no aria-hidden/inert on background content while Sheet is open; inline icon SVGs not consolidated into a shared <Icon>
PHASE C COMPLETE. 142 tests passing. Next: Phase D (Tasks 10-13 — data-access modules, schedule, roster, dashboard).
Task 10: complete (commits 8b834ad..38eedee, review clean, no fix round)
Task 10: minor (deferred): idempotent-unsubscribe boilerplate duplicated in events.js and availability.js; extract if a third subscribe* appears
SESSION PAUSED (2nd) 27 Jul 2026. HEAD 38eedee. Tasks 1-10 complete and reviewed clean, 167 tests passing. RESUME AT TASK 11 (Schedule screen) — brief already generated at task-11-brief.md. Briefs 12 and 13 also pre-generated.
Task 11: review round 1 — spec COMPLIANT, task quality NEEDS FIXES. 0 Critical, 2 Important: (a) realtime refresh sets loading=true unconditionally so every events change repaints a spinner over the whole list, and every RSVP blanks the availability bar in EventDetail; (b) src/lib/eventFormat.js ships 9 pure exports with no direct test file, leaving the half-score rule (both halves required for a result) unverified.
Task 11: controller ruling on reviewer WARN — the design system's green "N available" count on upcoming rows is deliberately omitted. Task 10 exposes only listAvailability(eventId), so rendering it per row is an N+1. DEFERRED TO TASK 16 (availability), which owns the counts view/RPC. Not a Task 11 gap.
Task 11: minor (deferred): calendar day cell aria-label announces N events but onSelect opens only the first (Schedule.jsx:239)
Task 11: minor (deferred): past fixtures awaiting a score sort to the top of Upcoming (ascending sort, Schedule.jsx:330)
Task 11: minor (deferred): tests/app.test.jsx:93 still named "renders the schedule placeholder" though it now renders the real screen
Task 11: minor (deferred): the hidden-token responsive guard never runs with the EventDetail sheet open, so the negative-margin hero has no automated responsive assertion
Task 11: minor (deferred): AVAILABILITY_TONES duplicates the same hex per status in bar and dot (EventDetail.jsx:70-74)
Task 11: minor (deferred): Schedule.jsx is 431 lines; CalendarMonth (~120 lines) is the obvious extraction if it grows
Task 11: minor (deferred): tabs are aria-pressed toggles, not an ARIA tablist — deliberate (a half-built tablist without roving tabindex is worse), recorded as a deviation from the brief's "Tabs" wording
Task 11: OPEN PRODUCT QUESTION FOR JAY — event times render in the browser's timezone, not forced to Asia/Dubai. A committee member travelling would see shifted kick-off times. Decide before go-live.
Task 11: fix round 1/5 (2 addressed, 0 open — realtime spinner flash fixed via isFirstLoad in Schedule and a settledForEvent ref in EventDetail; tests/event-format.test.js added, 28 cases; commits a6fb3e6..448f374). Re-review: all findings ADDRESSED, no new breakage.
Task 11: controller visual verification — rendered the real Schedule/EventDetail in Chromium at 375px and 1280px via harness/. CLEAN: EventDetail hero bleed exact at both widths, no horizontal overflow, nothing CSS-hidden (scores visible on every Results row), tab bar clears the last row, crest object-contain, chip variants match the design system, quinsGreen never used as text, zero console/page errors across 20 renders. ONE IMPORTANT DEFECT FOUND — see fix round 2.
Task 11: minor (deferred): Sheet.jsx:159 uses py-4 with no env(safe-area-inset-bottom) bottom padding; the prototype has it. On a home-indicator iPhone the sheet's last line sits under the indicator. Shared component from Task 9 — fix before Task 16, which puts every add/edit form in a Sheet.
Task 11: minor (deferred, inherited): desktop month grid is 775px tall (147px cells) — faithful to the prototype's aspect-ratio:1 with no desktop override, mostly whitespace.
Task 11: fix round 2/5 (1 addressed, 0 open — calendar day cells: both variants now share a CELL_LAYOUT constant with explicit flex items-start justify-start, overriding Chromium's UA button-content centring; day number now at top 8px / left 6px in BOTH variants at 375px and 1280px, was 13-vs-8 and 66-vs-8. Button semantics, aria-label and focus ring retained. New test splits cells by tagName and asserts the alignment tokens on each group independently, so the silent-divergence case fails. commits 448f374..8baba41). Re-review: ADDRESSED, no new breakage.
Task 11: housekeeping — screenshots/ re-ignored and git rm -r --cached'd (regenerable from harness/, 2.6MB per task would bloat a public repo across 22 tasks). harness/ stays TRACKED and now carries shoot-schedule.mjs plus events/availability stubs, so the next task re-runs the browser check instead of rebuilding it.
Task 11: LESSON CARRIED TO TASKS 12/13 — a <button> used as a layout box inherits Chromium's UA content-centring and no jsdom test can see it. The fixture rows are safe (they set flex items-center explicitly). Check any new non-text interactive element in a browser.
Task 11: RECURRING TOOLING BUG — .superpowers/sdd/.gitignore was reset to "*" by tooling THREE times during this task. Each time it silently untracks the entire ledger. Restored from HEAD each time and never committed as "*", but a future session will eventually commit it unnoticed. Root cause not found.
Task 11: complete (commits ad0ca54..8baba41, review clean after 2 fix rounds + a browser visual pass)
PHASE D IN PROGRESS. 228 tests passing across 13 files. Next: Task 12 (Roster screen) — brief pre-generated at task-12-brief.md.
