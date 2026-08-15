# A club admin may set a staff member's photo

**15 Aug 2026. Jay's ruling, and it REVERSES a deliberate narrowing made two
days earlier.**

## What it reverses

`db/migrations/20260813_staff_photos.sql` restricted the `staff-photos` write
policy to own-photo-only, and argued for it:

> ⚠️ **OWN PHOTO ONLY. NOT `can_edit_team`**, and this is a deliberate narrowing
> against the player-photo precedent, where a coach may upload for a child who
> cannot do it themselves. A coach is an adult with their own login. **Nobody
> else picks the picture of your face that thirty families see.**

That reasoning is not wrong. It was overruled on a fact it did not weigh.

## Why it was overruled

**Two of the club's fifteen staff have a photo** (measured 15 Aug 2026), and
most of the rest will never log in to change that. The Squad contacts block —
built the same day, and the reason anybody cares — renders a wall of monograms
without them. A consent principle that results in no faces at all protects
nobody in practice.

Jay asked for it directly, was shown the 13 Aug ruling and its reasoning, and
chose to reverse it.

## What is preserved

⚠️ **IT NOW MATCHES THE PLAYER-PHOTO RULE, AND THAT WAS A SECOND DECISION THE
SAME DAY.** Jay: *"just like teamsnap, sometimes photos need to be uploaded by
staff when parents forget"* — which is already live for player photos and always
has been: `can_edit_team(photo_team(name)) or is_own_player(photo_player(name))`.

A first pass made the staff rule **club admins only**. That was a conservative
reading of the overrule rather than anything asked for, and it left a split
nobody would defend: **a U16 coach could upload a child's photo but not a fellow
coach's.** Widened to `can_edit_team` the same afternoon, so the two buckets now
say the same thing — anyone who may edit a squad may set the photo of a person
attached to it, and anyone may set their own.

So the 13 Aug argument against `can_edit_team` is now **fully** retired rather
than half. What is still preserved is narrower and worth keeping: `set_my_photo`
remains self-only, so no ordinary caller gains anyone else's reach.

⚠️ **`set_my_photo` STAYS SELF-ONLY.** The self-serve path is used by everybody
and keeps the narrowest possible rule. The admin path is a separate function,
`public.set_staff_photo`, so no ordinary caller gains an admin's reach.

⚠️ **ONE PREDICATE, TWO CALLERS.** `private.may_set_staff_photo()` is used by
both the storage policy and the RPC. Two copies of an authorisation rule is how
they drift apart.

## The bug this nearly shipped with, kept because it is instructive

The first version of that predicate returned **NULL** rather than false when
there is no signed-in user: `_profile = auth.uid()` is NULL when `auth.uid()` is
NULL, and `NULL or false` is NULL.

⚠️ **THE TWO CALLERS THEN DISAGREED ABOUT IT.** A storage policy treats NULL as
not-true and denied. The RPC did not: `if not <NULL> then raise` never fires,
because `IF NULL THEN` is false — so it would have fallen through to the UPDATE.

Nothing was exposed — `anon` holds no EXECUTE on `set_staff_photo`, and any
authenticated caller has a non-null `auth.uid()` — but it was one revoke away
from being reachable. Fixed with `coalesce(..., false)` **inside the predicate**
rather than a guard in each caller: a predicate that can return NULL is one that
every future caller has to remember something about.

## What this decision does not settle

Whether the person should be **told** that somebody else set their photo. The
option was offered and not taken, on the grounds that the notification path does
not exist. If staff photos become contentious, that is the thing to build.
