# Quins Club Hub — Deploy & domain setup

This is the last piece of the v1 MVP build: exact steps to get the app live for the committee
trial on `adhjrt.com`, and later at `abudhabiquins.com`. Per this project's own constraint,
Claude designs and writes exact instructions; **Jay does the account setup, DNS changes, and the
actual "Deploy" clicks** — none of that can be done from this build session. Each step below
states plainly which side it's on.

---

## 1. Build

The app is a static single-page app (Vite + React), no server-side code beyond Supabase itself.

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: whatever the host defaults to is almost certainly fine (this repo has no
  Node-version-specific dependency); if a host asks explicitly, any Node 18+ works.

Running it locally (or letting the host run it) needs exactly two environment variables set at
**build time** (Vite inlines `import.meta.env.VITE_*` values into the built JS — they are not
read at runtime, so they must be present when `npm run build` runs, not just at request time):

| Variable | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://lusmshimxdcxpnrktlgz.supabase.co` | The project URL, safe to expose — it's just the API endpoint, not a secret. |
| `VITE_SUPABASE_ANON_KEY` | the `sb_publishable_…` key from Supabase → Settings → API | This is the **publishable** key — safe in a public frontend build by design. **Never** use the `sb_secret_…` key here or anywhere in this repo. |

Both are already documented the same way in `RESTORE.md` for local development — this is the
same pair, just set as the host's build-time environment variables instead of a local `.env`
file.

**Jay's step**: paste these two values into whichever host's "Environment variables" settings
page (see §2). Claude cannot see or set them for you — this is exactly the kind of value the
build's own constraint says only you should handle (it's not a password or the secret key, but
it's still project configuration tied to your Supabase account).

---

## 2. Static hosting — Netlify (or Vercel/Cloudflare Pages/your existing host)

`RESTORE.md`'s locked-in plan names Netlify, Vercel, or Cloudflare Pages (any free tier is large
enough for this app), or Jay's own existing web host if it accepts a plain file upload —
`abudhabiquins.com` itself runs on Wild Apricot, which does **not** fit that description (Wild
Apricot doesn't host arbitrary static site builds), so the trial goes on `adhjrt.com`, a domain
Jay separately owns, on one of the free static hosts. These instructions use Netlify as the
concrete example since it's the simplest "connect a GitHub repo, get a URL" path for this kind of
app, but the same three build settings (build command, publish directory, environment variables)
apply verbatim to Vercel or Cloudflare Pages if Jay prefers either of those instead.

**Jay's steps (Netlify example):**

1. Sign in to Netlify (or create a free account) — **Jay's own account**, Claude cannot create
   this.
2. "Add new site" → "Import an existing project" → connect the
   `github.com/jayjmuir-hub/quins-club-hub` repo (already public, per `RESTORE.md`) → authorize
   Netlify's GitHub access.
3. Branch to deploy: `build/v1-mvp` (not `main` — `main` only holds the initial scaffold commit,
   per `RESTORE.md`).
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Before the first deploy, add the two environment variables from §1 above (Netlify: Site
   settings → Environment variables → Add a variable).
6. Deploy. Netlify gives you a default URL like `random-name-123.netlify.app` — confirm the app
   loads there and a magic-link sign-in works **before** pointing a real domain at it (§3), so any
   problems surface against a throwaway URL, not the club's actual trial domain.

---

## 3. `adhjrt.com` trial subdomain

**Important, checked live via the Netlify MCP while writing this doc (28 Jul 2026): the bare
`adhjrt.com` root domain is already in use.** It currently points at an existing, unrelated
Netlify project of Jay's (`serene-gingersnap-1d0eb6`, plan `nf_team_pro`, password-protected,
deploy state "ready") — a **different app entirely** (its deploy functions are things like
`organizer-login`, `manager-signup`, `submit-registration`, `venue-layout`, `get-results`, built
from `github.com/jayjmuir-hub/adhjrt`, not this repo). This is not Quins Club Hub and this task
did not touch it. **This means the trial subdomain must genuinely be a subdomain** (e.g.
`app.adhjrt.com` or `club.adhjrt.com`), not the bare root domain, or it would either fail to
deploy (the root is already claimed by the other project) or — worse — silently overwrite Jay's
other app if the same Netlify project were reused by mistake. **Jay should confirm which
existing Netlify project(s) are his before starting §2** (a quick "Sites" list in his own Netlify
dashboard), and create a **new, separate** Netlify site for Quins Club Hub rather than adding it
to the existing `serene-gingersnap-1d0eb6` project.

Per the locked-in plan: trial on Jay's own domain, **committee-only** access — invite only
committee accounts (via Task 18's invite flow) plus sharing the unlisted URL directly, rather
than opening public sign-up. **Do not embed the app inside another site as an `<iframe>`** —
Supabase Auth's magic-link/OAuth redirect flow breaks inside an iframe (the redirect lands back
inside the iframe's restricted context, not as a real top-level navigation), so the app must be
reached as its own real page/subdomain, not framed into an existing page.

**Jay's steps:**

1. Pick a subdomain, e.g. `app.adhjrt.com` or `club.adhjrt.com` (avoid the bare root domain if
   anything else already lives there).
2. In `adhjrt.com`'s DNS provider (wherever the domain is registered/managed), add a **CNAME**
   record: the chosen subdomain → the host's own domain (Netlify: something like
   `<your-site-name>.netlify.app`; the host's own "Domain settings" page states the exact target
   to use, since it can include a per-account suffix).
3. Back in the host's dashboard (Netlify: Site settings → Domain management → Add a custom
   domain), add that same subdomain and follow its own verification step (usually automatic once
   the CNAME above resolves — can take up to a few hours to propagate).
4. Confirm HTTPS is issued for the new domain (Netlify does this automatically via Let's Encrypt
   once the CNAME resolves) — Supabase Auth's redirect flow requires HTTPS in production.
5. Test the whole sign-in flow against the real `adhjrt.com` subdomain (not the throwaway
   `*.netlify.app` URL) before inviting anyone — see §4, since this domain must be added to
   Supabase's allowed list **first**, or sign-in will silently fail here even though it worked on
   the throwaway URL.

---

## 4. Supabase Auth — allowed redirect URLs

Every domain the app is ever reached from needs to be explicitly allow-listed in Supabase, or
magic-link/OAuth sign-in will fail on that domain even though the rest of the app loads fine (the
symptom: clicking a magic-link email, or completing Google OAuth, redirects to the wrong origin
or shows an authentication error, because Supabase refuses to redirect back to a URL it doesn't
recognise as belonging to this project).

**Jay's steps**, in the Supabase dashboard (project `quins-club-hub`, ref `lusmshimxdcxpnrktlgz`)
→ **Authentication → URL Configuration**:

1. **Site URL**: set to the primary domain currently in use for real users — during the
   committee trial, this is the `adhjrt.com` subdomain from §3 (e.g.
   `https://app.adhjrt.com`); update it again to the `abudhabiquins.com` domain once the trial
   is over (§5).
2. **Redirect URLs** (an allow-list, can hold multiple entries at once — add, don't just
   replace): add the exact `adhjrt.com` subdomain URL used in §3 (e.g. `https://app.adhjrt.com`
   and, if the app is ever reached with a trailing path, `https://app.adhjrt.com/**` to match any
   path under it). Keep the throwaway `*.netlify.app` URL from §2 in this list too, at least
   during initial setup, so that URL keeps working for any further testing without needing a
   dashboard round-trip.
3. Save. No redeploy of the app itself is needed — this is a Supabase-side setting, not something
   baked into the built frontend.

**What breaks if this step is skipped**: a user clicks the magic-link email or completes Google
sign-in, and instead of landing back inside the app already signed in, gets redirected to a
Supabase error page (or, depending on the exact misconfiguration, back to `localhost` — Supabase
falls back to whatever `Site URL` was previously set, which may still be a development value).
This is the single most common "it works for me locally but not for the committee" failure mode
for this kind of app, so it's worth double-checking immediately after each domain change (§3, §5)
rather than waiting for someone to report a broken sign-in.

---

## 5. Later: moving to `abudhabiquins.com`

Once the committee has signed off on the `adhjrt.com` trial, the plan (per `RESTORE.md`) is to
point `abudhabiquins.com` (or `app.abudhabiquins.com`) at the same app and open invites more
widely. Frontend and backend are fully decoupled (the Supabase project itself never changes), so
this is purely a re-pointing exercise, not a rebuild or a data migration:

**Jay's steps:**

1. Repeat §3's DNS + host "custom domain" steps for the new domain/subdomain instead of
   `adhjrt.com` (`abudhabiquins.com` itself runs on Wild Apricot, so this almost certainly means a
   subdomain like `app.abudhabiquins.com`, with Wild Apricot's own DNS management used to add the
   CNAME, rather than moving the whole domain's hosting).
2. Repeat §4's Supabase step: update `Site URL` to the new domain, add it to `Redirect URLs`
   (there's no need to remove the old `adhjrt.com` entry immediately — leaving both live for a
   short overlap period is harmless and avoids breaking sign-in for anyone who still has an old
   magic-link email in flight).
3. No change needed to the Supabase project itself, the database, RLS policies, or any existing
   membership/player/event data — none of it is tied to a domain.
4. Once confirmed working on the new domain, open the invite flow beyond the committee per the
   locked-in plan's next phase.

---

## Summary: what's Jay's, what's Claude's

| Step | Who |
|---|---|
| Netlify/Vercel/Cloudflare account creation | **Jay** |
| Connecting the GitHub repo to the host | **Jay** (repo is already public and ready) |
| Pasting the two environment variable values | **Jay** (values provided in §1 above) |
| Build command / publish directory | **Already correct in this repo** — `npm run build` / `dist`, nothing to change |
| DNS record changes (`adhjrt.com`, later `abudhabiquins.com`/Wild Apricot) | **Jay** |
| Clicking "Deploy" / adding a custom domain in the host's dashboard | **Jay** |
| Supabase Authentication → URL Configuration changes | **Jay** (exact values provided in §4 above) |
| Everything else (app code, database schema, RLS, this documentation) | **Claude**, already done |
