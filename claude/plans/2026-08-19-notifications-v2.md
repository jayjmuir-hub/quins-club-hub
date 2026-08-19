# Plan — notifications v2: categories, prompting, deep links, and ticket tidying

**STATUS: PARTLY SHIPPED — step 1 (the deep-link fix) is built; everything else
is not.** Written 19 Aug 2026, the morning push notifications were first proved
on a real device.

⚠️ **Step 1 is built but NOT YET DEPLOYED, and it needs TWO deploys, not one** —
see "Deploying step 1" at the foot of this file. Until both land, tapping a
notification still leaves you where you were.

**Origin.** Jay, 19 Aug 2026, immediately after the first successful end-to-end
push on his Samsung S25 Ultra: *"we need notification turned on my default i
think, then people can opt out if they want and we need more notification
categories not just the help tickets, also i still cannot delete help tickets in
the admin section"* — then, minutes later: *"when i clicked the notification, it
took me to the more screen to the notifications area, not to the actually thing
that notified me to look at"*.

---

## ⚠️ The correction that shapes everything else

**"Notifications on by default" is not implementable, and no amount of better
engineering changes that.** Recorded here in full because it will be asked again.

Web Push permission belongs to the **browser**, not to this app. There is no
server-side call that subscribes somebody, no setting this repo controls, and no
API that grants `Notification.permission` on a person's behalf. Chrome, Safari
and Samsung Internet all require the person to tap the prompt themselves. This is
the design of the platform, not a gap in `src/lib/push.js`.

Two consequences that matter for what the club will actually experience:

1. ⚠️ **A subscription is per DEVICE and per BROWSER, not per person.** Jay's S25
   is subscribed; his laptop is not, and would be a second row in
   `push_subscriptions`. A parent with a phone and a tablet taps twice. **There
   is no state in which "the club has notifications on".**
2. ⚠️ **Prompting everybody on page load actively backfires.** Chrome tracks a
   site's permission dismissal rate and silently demotes poor performers to a
   quiet prompt most people never see. One badly-placed prompt can cost the club
   the feature permanently. **Never call `requestPermission()` on load.**

⚠️ **And the iPhone half of the club has an extra step nobody can remove.** iOS
grants Web Push only to an installed PWA (16.4+). Every iPhone parent must Share →
Add to Home Screen *before* the toggle appears at all. `PushNotificationsToggle`
already says so instead of showing a dead button — but it means realistic
adoption on iPhone is a fraction of Android's, and any plan that assumes "most
of the club will have this on" is wrong. **Push is an accelerant for people who
opt in, never the only route a message travels.**

**So what is achievable is the thing Jay actually described, minus the word
"default": make enabling it prominent, and make the CATEGORIES default to on so
the only decision anybody makes is the one unavoidable tap.** After that, opting
out is per category, exactly as asked.

---

## 1. The deep-link bug — fix first, it blocks everything else

**Two independent defects. Fixing either alone changes nothing.**

**(a) `public/push-sw.js` ignores the URL whenever the app is already open.**
`notificationclick` walks the open windows and returns `clients[i].focus()`. It
never navigates that window. `data.url` is read only on the `openWindow` branch,
which runs only when nothing is open.

That is precisely what Jay hit: he had just been on More → Notifications enabling
the toggle, so the app was open on that screen; the handler focused it and left
it there. ⚠️ **The bug is invisible in exactly the test everyone runs** — you turn
notifications on, so you are already sitting on the notifications screen when the
first one arrives.

**(b) `supabase/functions/push-send/index.ts` sends `url: ${APP_URL}/` anyway.**
The file's own comment records this as deliberate for v1: *"DOES NOT NAVIGATE TO
THE SPECIFIC REPORT… A real deep link is future work, not invented here."* This
is that future work.

**The fix:**

- In the service worker, try `client.navigate(url)` and then `focus()`, falling
  back to `postMessage` so the running React app can route itself.
  ⚠️ **`navigate()` is same-origin only and rejects on an uncontrolled client**,
  so the fallback is not optional — an installed PWA opened from a cold start is
  a different case from a focused tab.
- Every category sends its own destination (table below).

⚠️ **This must be verified from a REAL notification on a real phone, in both
states: app already open, and app closed.** The two paths are different code and
the broken one is the path the existing test never exercised.

### Destinations

| Category | Destination |
|---|---|
| Reply to your report | needs a route — see open question 1 |
| New notice posted | `/notices` |
| Fixture added or changed | `/schedule` |
| Availability still not set | `/schedule` |
| Admin: someone needs approving | `/admin/needs-attention` |

---

## 2. Categories and preferences

**Jay's four, all chosen 19 Aug**, alongside the reply-to-your-report trigger
that already ships:

1. **A new notice is posted** — `announcements`.
2. **Fixture added or changed for your squad** — `events`, scoped to squads the
   person's players are in.
3. **Availability still not set** — a nudge before a fixture. ⚠️ **The only one
   that is not a row-change trigger**; it needs a schedule, so it is the most
   expensive of the four and should ship last.
4. **Admin: someone needs approving** — a new access or staff request.

### ⚠️ Store opt-OUTS, not preferences

**Proposed: `notification_opt_outs (profile_id, category)`. A row means OFF. No
row means ON.**

This is the design that makes "default on" true without a lie in it:

- **No backfill, ever.** Every member who exists today, and every member who
  joins next season, is opted in with no migration and no row.
- **The default lives in one place** — the absence of a row — rather than in a
  column default *and* an application constant *and* a backfill script, which is
  three places to disagree.

**⚠️ The argument AGAINST, which is real and was made:** a full preferences row
per person per category is more discoverable. You can query "who wants fixture
alerts" directly; with opt-outs you must query the absence, joined against the
membership list. **Rejected because the discoverability is worth less than
never having to backfill a default across a growing club**, and because every
count this repo has ever stored has rotted. But if a future admin screen needs
to *show* per-person preferences, revisit this — it is the one thing opt-outs
make awkward.

RLS: owner-only, the same shape as `push_subscriptions`
(`profile_id = auth.uid()`), which already has a proven policy to copy.

### The UI

The existing single toggle in More becomes the master switch plus four
checkboxes. ⚠️ **The master switch still governs the browser permission** — the
checkboxes are meaningless until it is on, and must read as unavailable rather
than as four things that silently do nothing.

---

## 3. Prompting — Jay chose BOTH

- **A dismissible card on Home** for anyone who has not enabled it, explaining
  what they would get. Covers everybody already signed up.
- **A prompt at onboarding, once access is approved** — the moment of highest
  engagement. Covers new families.

⚠️ **Neither may call `requestPermission()` itself.** Both route to the toggle,
and the person taps there. See the correction above: an unprompted permission
dialog is how the club loses the feature for everyone.

⚠️ **The Home card must stay dismissed once dismissed**, per device, and must not
reappear on every load. A nag is worse than nothing here — it trains people to
ignore the one card that matters.

---

## 4. Help tickets — Jay chose BOTH

**(a) Hide resolved by default.** `done` and `wontfix` drop out of the default
admin list, with a toggle to show them. **No database change** — this is the
cheap half and can ship on its own.

**(b) A real delete, admins only.** ⚠️ **`public.feedback` has NO DELETE POLICY
today** — measured 19 Aug: three policies exist, `feedback create` (INSERT),
`feedback read` (SELECT), `feedback triage` (UPDATE). With RLS on and no DELETE
policy, every delete is refused whatever the table grant says. **So this is not
a broken button, it was never built** — neither the policy nor a data-layer
function nor any UI.

Needs:
- an RLS DELETE policy scoped to `private.is_admin(club_id)`;
- a delete in `src/data/feedback.js`;
- a confirm step in the admin UI;
- ⚠️ **a harness in `db/tests/` proving a NON-admin cannot delete**, with the
  fault injected — the house rule, and this one guards a destructive verb on a
  live table.

⚠️ **Deleting removes something the reporter can still see.** `feedback read`
admits `submitted_by = auth.uid()`, so a member can read their own report and a
delete makes it vanish from under them with no trace. Intended for genuine
rubbish — spam, a test, a duplicate — not for closing a real complaint. Worth a
word in the confirm dialog.

---

## Order of work

1. ✅ **The deep-link fix — BUILT 19 Aug 2026.** `public/push-sw.js` now
   navigates an already-open window instead of only focusing it,
   `push-send` sends `/my-reports` instead of the app root, and `/my-reports`
   exists as a screen for it to land on. `tests/push-sw.test.js` is new and
   is the thing that could see the bug: written first, it failed on exactly
   the missing `client.navigate()` call, then passed.
2. **Hide resolved tickets.** No database change, immediate relief.
3. **Delete tickets** — policy, harness, UI.
4. **Opt-outs table + the four categories**, notices first (highest value, and
   `announcements` already has the trigger shape to copy).
5. **Prompting** — Home card, then onboarding.
6. **Availability nudge last** — it needs a schedule, unlike the other three.

## Open questions

1. **Where should "someone replied to your report" go?** There is no route for a
   member's own reports today — it lives inside the `?` help sheet. Either a new
   `/my-reports` route (linkable, simple, recommended) or a query parameter that
   opens the sheet. **Needs Jay's call before the deep-link fix ships**, because
   it is the destination for the one category that already exists.
2. **Should the fixture alert cover cancellations separately?** A cancellation is
   the one people most need same-day and might want even if they muted changes.

---

## ⚠️ Deploying step 1 — TWO deploys, and forgetting the second is a known trap

**Both halves must land or nothing changes.**

1. **Netlify** — `public/push-sw.js`, the `/my-reports` screen and route.
   An ordinary production deploy. ⚠️ **A service worker also has to be picked
   up by the browser**, so the first tap after deploying may still use the old
   worker; the app is configured `autoUpdate`, but confirm on the device rather
   than assuming.
2. **Supabase** — `supabase/functions/push-send`. ⚠️ **EDGE FUNCTIONS DO NOT
   DEPLOY WITH NETLIFY.** The calendar function sat on a stale version for hours
   on 14 Aug 2026 for exactly this reason —
   `claude/handoffs/2026-08-14-tbd-tournaments-and-pitches.md`.

**Verify on a real phone, in BOTH states, because they are different code paths
and only one of them was ever broken:**

- **app already open** — the path that failed for Jay. Open the app on any
  screen, have somebody reply to a report, tap the notification, expect
  `/my-reports`.
- **app closed** — the `openWindow` path, which was already correct and must
  stay correct.
