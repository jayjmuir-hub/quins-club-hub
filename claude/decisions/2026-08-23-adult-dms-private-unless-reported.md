# Adult-to-adult DMs are private unless a message is reported

**Date:** 23 Aug 2026, evening. **Decided by:** Jay.
**Supersedes:** the same morning's ruling, recorded in
`claude/plans/2026-08-23-squad-chat.md`, that any club admin may read any DM.

## The ruling

> I don't think dm between adults should be visible to anyone except those
> people, unless a message is reported.

## What it means in the database

A conversation is **reviewable** by an admin (`private.admin_may_review`) when:

- either participant is a minor — `private.is_minor_profile`: a `player`
  membership under 18, or with no date of birth — **or**
- any message in it has been reported (`message_reports`), resolved or not.

Otherwise only the two participants can read it, it does not appear in the
Welfare overview, an admin cannot remove a message in it, and
`public.log_welfare_access` refuses the open. Nothing changes for minors'
conversations, which were the safeguarding case the morning ruling was for.

## Why "resolved or not"

Resolving a report should not re-seal a conversation an admin has already,
legitimately, read — and the access log has already recorded that they did.
A frivolous report therefore opens a conversation permanently. That is the
price of the simpler rule, accepted knowingly; if it is ever abused, the
remedy is a `dismissed` outcome on the report that does not count, not a
timer.

## What it means on the screen

The permanent notice in a thread is worded by the database's answer
(`public.conversation_involves_minor`):

- minor in it: *"Club admins can review this conversation."*
- adults only: *"If a message is reported, club admins can review it."*

An admin who opens an adults-only, unreported conversation by URL gets
"This conversation isn't available to you" — the database returned no row.

## Proof

`db/tests/adult-dms-private.sql`, five assertions with a control, run against
production inside a rolled-back transaction before the apply.
