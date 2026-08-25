# Handoff — the bat-wing app icon, approved but NOT yet shipped

**25 Aug 2026, morning. Jay ended the session at the "ship it" doorstep — the
DESIGN IS APPROVED, nothing is built or deployed.** A new session picks up
here. History, not instruction — but this one is fresh, and the ship
checklist below was written minutes after the approval.

## What Jay approved (his words along the way)

The app icon becomes the flat **CLUB HUB crest** on a **quins-green gradient
with red bat-wing arcs** rising from the bottom corners, plus a soft red glow
behind the crest. The journey: pin photo icon SHIPPED earlier (#393, live
now) → Jay pivoted back to the flat crest ("lets go back to the previous
logo but use the green gradient background") → white-fringe and pinhole
cleanup → red exploration ("could we add some quins red to the gradient?")
→ corners+glow combo → curved ("almost like its bat wings") → scalloped D2
→ **final: D2 with the arc toned down**. Approved render:
`claude/handoffs/assets/2026-08-25-icon-wing-master-512.png` — that PNG *is*
the approved look, pixel-exact.

## The recipe (all of it, so the master can be regenerated)

- **Crest source**: `git show 0006574:public/icons/icon-512.png` (the pre-pin
  "CLUB HUB" artwork; after #393 the working tree copy is the PIN, not this).
  Clean it: mask = alpha ≥ 240 → largest connected component → flood-fill
  hole close (three pinholes exist in the artwork) → MinFilter(3) erode ×2
  (kills the white AA fringe Jay spotted) → NO blur on the mask (blur
  reached back into the old shadow ring and made dark specks; the LANCZOS
  downscale supplies the anti-aliasing) → cv2.inpaint the pinhole pixels.
- **Tile 512×512**: vertical gradient rgb(56,178,100) → rgb(16,78,44).
- **Wings**: red gradient rgb(200,16,46) → rgb(120,10,28) by y, shown where
  `y > wing(x)` with `u = |x−256|/256`,
  `wing = 470 − 128·u^1.5 − 18·|sin(2πu)|`
  (the toned-down numbers; the rejected bigger arc was 462−156·u^1.5−26·…).
- **Glow**: crest alpha blurred 26, painted rgb(200,16,46) at α170, blurred
  14 again, under the crest.
- **Shadow**: crest alpha blurred 7, rgb(0,8,4) α150, offset +4,+10.
- **Crest**: 74% of tile height, centred, LANCZOS.

## Ship checklist (agreed with Jay, none of it done)

1. Extend/replace `harness/make-icons-pin.py` for this design (crest-source
   extraction from git SHA `0006574`, wing/gradient/glow parameters). Keep
   the repeatability rule: icons are derived artefacts.
2. Sizes: square icons + favicon as before; **maskable pair smaller** —  the
   pin era used 58% height for Android's circular safe zone; recompute for
   this composition (the wings run to the tile edge, which a circle crop
   will eat — check a circular preview before shipping).
3. **Bump the manifest icon URLs** (e.g. `-v2` suffix) in `vite.config.js`
   — agreed with Jay so ALREADY-INSTALLED Androids pick the new icon up
   automatically (~a day); same-URL byte changes do NOT propagate. iPhones
   never auto-update icons: remove + re-add, Apple's rule (Jay knows).
4. Tombstone `make-icons-pin.py`'s header (pin era: one day, #393) the way
   `make-icons.mjs` was tombstoned before it.
5. Changelog entry (no SHA) + cite whatever squash is newest at ship time —
   the chain moves fast; trust CI's docs-check in both directions.
6. Preview → Jay's look-approval → his explicit yes → merge (main is live).

## Traps already paid for (do not rediscover)

- The session-start clone check flagged this cafnet worktree 30 behind /
  2 ahead — branch fresh from origin/main (this handoff branch was), and
  ignore the stale worktree branches (`claude/pin-icon` etc., all merged).
- Red and green blend to mud: every red element uses HARD edges or sits
  BEHIND the crest as a glow; the only approved fade is the narrow one Jay
  rejected anyway in favour of wings.
- The pin-photo source (`harness/pin-photo.jpg`) and its generator stay in
  the repo untouched — the pin icon is what is LIVE until the wings ship.
