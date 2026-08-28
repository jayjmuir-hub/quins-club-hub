# Chat polls are open and their votes are visible — like WhatsApp

**Jay, 27 Aug 2026**, settling the two questions that gate the polls feature
(design in `claude/plans/2026-08-27-chat-polls.md`). Asked to build voice
messages and polls "exactly like WhatsApp", polls first. Two forks were put to
him with their trade-offs; he chose full WhatsApp parity on both.

## The rulings

1. **Anyone who can write in a chat can post a poll there** — squad channels,
   staff channels, the club channel, DMs, groups. No staff gate, no per-space
   carve-out. Same posture as
   `claude/decisions/2026-08-24-chat-photos-open.md` (photos open) and
   `claude/decisions/2026-08-24-groups-open-no-warnings.md` (groups open):
   openness with a working report loop, over warning copy that reads as distrust
   of the parents the feature is for.
2. **Votes are not secret.** Everyone who can read the poll message can tap
   "View votes" and see exactly who voted for each option — the WhatsApp
   behaviour. Enforced by the votes read policy deferring to the message's own
   read policy, so the audience is precisely the chat.

## The reasoning

Polls are the informal-coordination tool the club runs on WhatsApp today —
"which weekend for the social", "curry or pizza after training", kit sizes. This
feature moves that onto the app's better rails (private storage, author delete,
the report→welfare loop) rather than creating something new. Visible votes are
what make a poll useful for "who hasn't answered yet", and are what the members
already expect from WhatsApp.

## The arguments AGAINST, made at the time — so nobody re-litigates blind

- **Visible votes expose a child's choice to the whole chat.** In a squad
  channel that includes children, "View votes" shows each child's pick to every
  other member. Two softer shapes were offered — staff-see-names/others-see-
  counts, and fully-anonymous-counts-only — and both were declined for parity.
  True that anonymity would be safer; overruled because it diverges from
  WhatsApp, loses "who hasn't voted", and the same visibility already exists in
  the club's WhatsApp groups with none of the app's protections. If a complaint
  about an exposed vote ever lands, this is the line to reread first, and the
  staff-only-names variant is the ready fallback — the read policy is the only
  thing that would change.
- **A staff-only posting gate would narrow who can start a poll.** It would also
  break parity and the openness pattern set for photos and groups, and the
  informal polls this is for are exactly the ones a parent or manager starts.
  Overruled.
- **Anonymous polls would remove the safeguarding question entirely.** They would
  also stop a coach seeing who still needs to answer an availability-style poll,
  which is half the point. Overruled, but recorded as the cleanest escape hatch
  if the visible-vote posture ever has to be walked back.

## What this deliberately declined

Anonymity, a staff gate, closing/expiry, editing a posted poll, and forwarding
as a live poll are all out of scope for v1 — see the plan's "known limitations".
Voice messages, the other half of the original request, are **not** covered by
this ruling: they raise a separate moderation question (audio cannot be
moderated at a glance, the reason documents were declined for photos) and get
their own decision when built.
