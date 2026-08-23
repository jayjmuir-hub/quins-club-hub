# Messages and chats delete for good — except a reported one, which only an admin may delete

**Date:** 24 Aug 2026. **Decided by:** Jay ("i still can't completely delete
messages or chats"); the exception is Claude's, stated to Jay before building.

## The ruling

Deleting a message deletes the row. Deleting a DM deletes it for both
participants. Clearing a channel deletes every post in it. No placeholders,
no hide-for-me.

## The exception

A message that has been reported — or a post with a reported reply, or a DM
containing any reported message — can be deleted only by an admin (for a DM,
an admin who may review it) until the report is resolved.

**Why.** A report is the club's evidence. If the author of the reported
message could delete it, every report would race its own evidence, and the
Welfare dashboard would show "1 reported message" pointing at nothing. The
admin resolving the report is the right person to decide whether it goes.

**What this costs.** Someone who wants a message gone and finds it reported
has to wait for an admin. That is the point.

## Also decided here

The welfare access log outlives the conversation it records. Deleting a DM
must not erase the record of which admin opened it and when.

## Proof

`db/tests/delete-for-good.sql`, assertions 3, 4, 6 (the exception from three
sides) and 7 (the log survives).
