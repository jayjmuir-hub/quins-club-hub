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
