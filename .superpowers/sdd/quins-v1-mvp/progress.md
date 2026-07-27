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
