// Harness stub for src/data/accessRequests.js. Needed because AppShell now
// imports RequestAccess, which imports this module, which imports the real
// Supabase client — so without the alias the whole harness fails to boot with
// "Missing required Supabase env var(s)" before rendering a single pixel.
// Keeping the alias here is what preserves the harness's "no network, no
// credentials" property.
export async function getMyAccessRequest() {
  return null
}
export async function createAccessRequest() {
  return { id: 'req-1', status: 'pending' }
}
export async function listAccessRequests() {
  return []
}
export async function dismissAccessRequest() {
  return null
}
export async function restoreAccessRequest() {}

// ⚠️ ADDED WITH THE ROLE/SQUAD PICKER (16 Aug 2026), and tests/harness-stubs.js
// is what demanded it — the fifth time that guard has earned its keep. The real
// module reaches an RPC; a harness that returns nothing here renders a picker
// with no options, which is precisely the failure the RPC exists to prevent, so
// the stub ships squads.
export async function listSquadsForRequest() {
  return [
    { id: 't1', name: 'U12 Boys', sort_order: 4 },
    { id: 't2', name: 'U14 Boys', sort_order: 6 },
    { id: 't3', name: 'U16 Boys', sort_order: 8 },
  ]
}
