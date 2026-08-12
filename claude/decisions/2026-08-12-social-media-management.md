# Decision: Social Media Management is a noticeboard, not a photo library

*12 Aug 2026. Jay's ruling. Reasoning, not current state — `RESTORE.md` and the
code win on what is true today.*

## The ask

The `media` right had existed since 10 Aug 2026 and unlocked nothing. Asked what
the job actually is, Jay:

> "this would not be taking player account photos and posting them on social
> media, the intent is to give the social media manager all in one view of the
> events happening or have happened like matches, tournaments, socials, etc and
> also give club members the ability to submit potential social post ideas to
> the social manager, they would click something that would open a form they
> could fill out with details and drop a photo into themselves"

## ⚠️ The most important thing here is what was RULED OUT

A social-media feature is the first thing in this app that points at
**publication**, and the obvious build — reach into `player-photos`, which every
admin can already see, and offer them for posting — **was explicitly rejected by
Jay before it was proposed.**

That distinction is not cosmetic and must not be eroded later:

- **Seeing a child's photo on the roster and putting it on Instagram are
  different acts requiring different consent.** The roster photo was uploaded so
  a coach can recognise a child on a pitch. Nobody agreed to publication.
- **What ships instead is submitter-chosen.** A member uploads a photograph
  they have decided to offer, for this purpose, in the moment. That is consent
  given for the act being performed.

⚠️ **`player-photos` is therefore OUT OF SCOPE FOR THIS FEATURE, permanently
until Jay says otherwise.** A future "pick a squad photo" button is a new
conversation, not an enhancement.

## What was decided

| Question | Ruling |
|---|---|
| Who may submit | **Any member with access** — parents, players, staff |
| Staff submissions | **Marked**, so the manager can triage |
| Link to an event | **Optional** — either about a fixture, or free-standing |
| Tracking | Jay: *"add tracking the way you think is best"* |
| Consent wording on the form | **Yes** |

## ⚠️ The staff mark is computed in the database, never sent by the client

`from_staff` is set by a trigger from the submitter's own membership. A boolean
the browser supplies authorises nothing — the same lesson as `memberships.is_super`,
where a naive column would have let any admin promote themselves. **Policies
authorise the row; a client-supplied value authorises nothing at all.**

## Tracking: mirrored from `pitch_requests`, deliberately

Jay left the design to me and the answer is to copy a loop this codebase has
already proved rather than invent a second one:

- **`status`: `new` → `used` / `dismissed`**, a CHECK not an enum, so adding a
  state stays a one-line migration.
- **Deciding is `is_admin`** — ⚠️ **not the `media` right.** Rights gate SCREENS,
  never data (`claude/decisions/2026-08-10-role-dashboards.md`). This is the
  same line `pitch_requests` draws.
- **The submitter sees their own idea and its outcome.** Without that the
  feature is a black hole: you submit into silence and never learn whether it
  was used. That was a stated requirement of the pitch loop and it applies here
  for the same reason.
- ⚠️ **Withdrawing is a DELETE, not a status write, and only while `new`.**
  Widening UPDATE to the submitter would also let them write `status = 'used'`.
  Deleting their own un-actioned idea is the narrow power that cannot be abused.
- **The manager may mark AND remove** — Jay, 12 Aug: *"give the manager the
  ability to mark things and remove them"*. So an admin holds DELETE over any
  idea in the club, not only the submitter over their own.

⚠️ **ADMIN DELETE IS THE ONLY REAL CONTROL OVER AN INAPPROPRIATE PHOTO, and
that is why it matters more than it looks.** The consent line on the form is a
prompt; the manager is the review gate; and until now the gate could only
*decline to post*, leaving the image sitting in club storage indefinitely.
Removal is what makes the gate mean something.

⚠️ **THE PHOTO MUST BE DELETED BEFORE THE ROW, AND THE ORDER IS THE WHOLE
POINT.** `delete from storage.objects` raises `42501` — storage cannot be
cleared by SQL, so the app has to remove the object through the storage API as a
separate step from deleting the row. Two failure modes, and they are not
equally bad:

- object gone, row left → a visible broken entry the manager can try again on;
- row gone, object left → **an orphaned image nobody can find or reach**, which
  is precisely the file that was being removed.

So: **remove the object first, and only delete the row if that succeeded.** A
failure leaves the idea on screen, which is honest.

⚠️ **Jay first chose NO tracking at all** — smallest possible first version —
and reversed it when shown that an inbox with no "dealt with" only grows, so the
same idea is re-read every week. Recorded because "ship the smallest thing" was
the right instinct and the reversal was about one specific consequence, not
about the instinct being wrong.

## ⚠️ The widest door in the app, opened knowingly

Any member can now upload an image. It is not the safeguarding problem that
account photos would have been — the submitter chooses the file — but:

- **a photo may contain other people's children**, and
- **the manager is the only review gate before anything is published.**

The mitigation is a line on the form saying the photo may be published and to
send only photos they are happy for the club to use. **That is a prompt, not a
control.** If the club ever wants a real gate, it is a second reviewer or a
consent register, and neither exists.

## What this does NOT decide

- **Scheduling or planning posts.** Jay named it as part of the job; nothing
  here builds a calendar of what will be posted when. The two views ship first.
- **Posting anywhere.** Nothing integrates with Instagram, Facebook or WhatsApp.
  The manager still posts by hand.
- **Any change to what an admin may see.** Reading ideas is `is_admin`; the
  `media` right decides only who is shown the screen.
