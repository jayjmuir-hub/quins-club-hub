# Groups are open, with no safeguarding language — and what that deliberately declined

**Jay, 24 Aug 2026**, during the group-chat design
(`claude/plans/2026-08-24-group-chats.md`): *"if its a group then we don't
need any of the warnings"*, on the grounds that *"parents are already
consenting when they allow they players to create accounts in the app"*.

## The ruling

1. Anyone in your picker audience can be added to a group, minors included —
   no `staff_dm_opt_in`, no notices, no warning copy anywhere in the group UI.
2. A group is **three or more people**. Two people is a DM and keeps every
   DM rule. Jay accepted this floor explicitly, same day.
3. Welfare may read a group involving a minor **only once a message in it is
   reported** — enforced in the database, shown nowhere. Also accepted
   explicitly.
4. **The 23 Aug DM rules are unchanged** — this ruling is about groups only.
   `private.can_dm` still governs two-person chats in full:
   `claude/decisions/2026-08-23-adult-dms-private-unless-reported.md`.

## The arguments AGAINST, made at the time — so nobody re-litigates blind

- **Account consent is not contact consent.** The 23 Aug design placed the
  DM opt-in next to the *photo* consent precisely because "may use the app"
  and "may be contacted privately by an adult" are different grants. Jay's
  answer: a group is not private contact — other people are in the room —
  and that is also what sports-safeguarding guidance prefers over 1:1
  channels. The counter-argument was accepted for DMs (which keep their
  rules) and overruled for groups.
- **The two-person loophole.** With no group rules at all, a "group" of two
  is a DM that skips `can_dm`. Closed by the ≥3 floor rather than by
  warnings — a definition, not a banner.
- **Guardian visibility.** Under the 23 Aug DM ruling a guardian can open a
  consented DM from the player's card; groups give guardians no equivalent
  view and no notification that their child joined one. Argued, overruled —
  recorded here as the accepted residue of ruling 1. If a parent complaint
  ever lands, this is the line to reread first.
- **The no-notice trade.** Every DM thread carries a sentence saying who can
  read it; groups say only "N people". The transparency argument lost to
  Jay's judgment that warning copy on an open parents' group reads as
  distrust of the very people the feature is for.
