# Runbook: scope the auth-email app to one mailbox

**Status: OVERDUE. Not yet applied.**

## Why this matters

`Mail.Send` was granted to the "Quins Club Hub — auth email" app registration as an
**Application** permission. Application permissions are not scoped to a user — they
apply to the whole tenant. As it stands, anything holding that client secret can send
mail **as any mailbox in `adhquins-clubhub.com`**, not just `noreply@`.

The function is publicly reachable (`verify_jwt` is off, because Supabase Auth calls it
server-to-server). The only thing between the internet and "send mail as the club" is the
webhook signature check. That check is sound — but it is currently the *single* control.
This runbook adds the second one.

Deferred deliberately while 5.7.708 was being diagnosed, so that a send failure could be
attributed to the code or to the policy but never both. That reasoning has expired.

## The concept

`New-ApplicationAccessPolicy` is an Exchange Online control that narrows an application
permission to a named set of mailboxes. It is enforced by Exchange, not by the app, so it
holds even if the client secret leaks.

It works on a **mail-enabled security group**, not on a mailbox directly — so step 1
creates a group whose only member is the sending mailbox.

## Steps

**In PowerShell on jay-pc**, as the tenant admin.

1. Install the module, once per machine:

   ```powershell
   Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
   ```

2. Connect:

   ```powershell
   Connect-ExchangeOnline -UserPrincipalName admin@quinsclubhub.onmicrosoft.com
   ```

   A browser sign-in window opens. Complete it there.

3. Create the mail-enabled security group that will hold the one allowed sender:

   ```powershell
   New-DistributionGroup -Name "Quins Club Hub auth email senders" `
     -Alias quins-auth-senders `
     -Type Security `
     -Members noreply@adhquins-clubhub.com
   ```

4. Apply the policy:

   ```powershell
   New-ApplicationAccessPolicy `
     -AppId bec2ed8e-4174-466d-b6ad-7f701534d67a `
     -PolicyScopeGroupId quins-auth-senders@adhquins-clubhub.com `
     -AccessRight RestrictAccess `
     -Description "Restrict Quins Club Hub auth email to the noreply mailbox"
   ```

5. **Verify it allows the mailbox it should:**

   ```powershell
   Test-ApplicationAccessPolicy `
     -Identity noreply@adhquins-clubhub.com `
     -AppId bec2ed8e-4174-466d-b6ad-7f701534d67a
   ```

   Expect `AccessCheckResult : Granted`.

6. ⚠️ **Verify it REFUSES one it should not.** This is the step that actually proves the
   policy — step 5 alone would pass even if the policy had not applied:

   ```powershell
   Test-ApplicationAccessPolicy `
     -Identity admin@quinsclubhub.onmicrosoft.com `
     -AppId bec2ed8e-4174-466d-b6ad-7f701534d67a
   ```

   Expect `AccessCheckResult : Denied`. **If this says Granted, the policy is not in
   force** — do not treat the job as done.

7. Disconnect:

   ```powershell
   Disconnect-ExchangeOnline -Confirm:$false
   ```

## After applying

Policy changes take up to **30 minutes** to propagate. Until they do, both results above
may still read `Granted`.

Once 5.7.708 is lifted, send a real magic link and confirm it still arrives. A `403` from
Graph `sendMail` after this change means the policy is excluding `MAIL_FROM` — that case is
already documented in the function's own error comments.

## ⚠️ The same gap exists on `adhjrt.com`

The tournament app can send as `admin@adhjrt.com` with the same unscoped arrangement.
Different repo, same real exposure. Not fixed by this runbook.
