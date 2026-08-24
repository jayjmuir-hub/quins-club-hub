# Chat photos are open, like WhatsApp — and what that deliberately declined

**Jay, 24 Aug 2026**, settling the question that blocked "add attachments and
pics to a chat" (`claude/plans/2026-08-24-chat-feedback.md`). Offered three
shapes — open like WhatsApp, adults-and-staff-only spaces, staff-post-only —
he chose **open**.

## The ruling

1. **Anyone may attach a photo anywhere they can already write.** Squad
   channels, groups, DMs, the staff channel — if you can type there, you can
   attach a photo there. No per-space carve-outs, no warning copy.
2. **Images only** (jpg/png/heic/webp), compressed client-side before upload.
   Documents were offered and declined for now — photos can be moderated by
   looking at them; files cannot.
3. **The safety valve is the machinery chat already has**, not consent
   collection: the `chat-media` bucket is PRIVATE and readable only by people
   who can read the thread; the author may delete (which deletes the object);
   and the report → welfare → resolve loop covers a photo message exactly as
   it covers a text one.
4. **Retention/expiry is out of scope** — Phase 4 territory
   (`claude/plans/2026-08-23-squad-chat.md`), not started, unchanged by this.

## The reasoning

The club's squad WhatsApp groups already share photos of children freely,
with no private storage, no author-visible delete, no report loop and no
welfare oversight. This feature does not create photo-sharing at the club —
it moves the photo-sharing that already happens onto strictly better rails.
Same logic as `claude/decisions/2026-08-24-groups-open-no-warnings.md`:
openness with a working report loop, over warning copy that reads as
distrust of the parents the feature is for.

## The arguments AGAINST, made at the time — so nobody re-litigates blind

- **Nobody can verify consent for an ad-hoc team photo.** The per-player
  photo consent next to the DM opt-in governs the child's own profile photo;
  a parent's match-day photo of nine children is ungovernable by any flag.
  True — and equally true on WhatsApp today, with none of the protections
  above. Accepted as the residue of ruling 1. If a parent complaint about a
  chat photo ever lands, this is the line to reread first.
- **Adults-only spaces would keep photos away from children entirely.** It
  would also kill the single most-wanted use — a parent sharing a match
  photo into the squad group — and push that use straight back to WhatsApp.
  Overruled on those grounds.
- **Staff-post-only narrows the risk surface.** Same defect: the parents are
  the photographers. Overruled.
- **Storage cost.** Client-side compression (~1600px JPEG) keeps a photo to
  a few hundred KB against a Supabase Pro plan; not a real argument yet. If
  the bucket ever matters on the bill, retention (Phase 4) is the answer,
  not a posting rule.
