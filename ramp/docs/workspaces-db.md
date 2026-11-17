# Workspaces: what the database gives the frontend

Migrations `007_ramp_workspaces.sql`, `008_ramp_agency_link.sql` and `009_ramp_subscriptions.sql` turn RAMP into many isolated workspaces, grouped into accounts, with a platform super admin above them.

## How it works

- **Current workspace.** Each user has one current workspace, `ramp_ws()`. It's their saved preference, or else their first active membership. The preference is per user, not per tab, so switching changes every tab and device.
- **Table access stays the same.** Every existing `.from('ramp_…')` call keeps working, and RLS limits it to the current workspace.
  - Inserts without `workspace_id` land in the current workspace. Don't send `workspace_id` from the browser. If you do, it must equal the current workspace, or the insert fails RLS.
  - `ramp_org` has one row per workspace, so `.select('*').single()` and `.update(…).eq('id', true)` still work.
- **Paused accounts get nothing.** While a workspace or its account is paused or closed, or a trial has ended, `ramp_ws()` is null for everyone except super admins. Every table read then returns nothing. `ramp_session_start` says why.
- **Super admins** can enter any workspace. They get a hidden support member row (level admin), which RLS hides from the tenant and which doesn't use a seat. Entering is logged in the tenant's audit log as "support access".

## Session: `ramp_session_start()` → jsonb

| state | meaning |
|---|---|
| `signed_out` | no login |
| `no_access` | no membership anywhere. `request` is their sign-up request if any (e.g. `status: 'declined'`, with `decision_note`). `requested` is true if they asked for access to a workspace. |
| `account_pending` | they have a pending sign-up request, or their account is pending |
| `account_paused` | the workspace or account is paused (by a super admin or by billing) |
| `account_closed` | the workspace or account is closed |
| `trial_ended` | the plan is `trial` and `trial_ends` is in the past |
| `inactive` | their member row in this workspace is inactive |
| `expired` | guest past `access_until` |
| `ok` | load the app with `member_id` |

The other keys are:
- `email`, `super`, `request`, and `workspaces` (the same rows as `ramp_my_workspaces()`)
- `workspace_id`, `member_id` (only when `ok`), and `support` (true when a super admin is inside a tenant)
- `workspace {id, name, slug, status, setup_done}`
- `account {id, name, plan, status, trial_ends, seat_limit, is_owner}`

A super admin with no workspace yet gets `state: 'ok'` with `workspace_id: null` and `member_id: null`. Send them to the console. For any non-ok state, offer the switcher if `workspaces` has more than one entry.

## New RPCs

Everything below is for `authenticated` users, except the service-role functions at the end.

**Workspace and session**

| RPC | Returns | Who |
|---|---|---|
| `ramp_ws()` | uuid of the current workspace | anyone |
| `ramp_is_super()` | boolean | anyone |
| `ramp_my_workspaces()` | rows `{id, name, slug, status, setup_done, account_id, account_name, plan, account_status, trial_ends, level, member_status, support, is_owner, is_current}` | active members; super admins get every workspace |
| `ramp_set_workspace(p_ws uuid)` | uuid. Saves the preference. After it, re-run `ramp_session_start` and reload all state. | active members of `p_ws`, or a super admin (support row created) |
| `ramp_seats()` | `{used, limit, plan}` for the current account. `limit` null means unlimited. | members |
| `ramp_workspace_setup_done()` | void. Sets `workspace.setup_done`, for the setup wizard. | admins |
| `ramp_account_add_workspace(p_name text)` | uuid. Copies the library and makes the account owner its owner. The owner is switched into it. | account owner (capped by `ramp_platform.workspace_limit`), or a super admin (for the current workspace's account) |

**Sign-up**

| RPC | Returns | Who |
|---|---|---|
| `ramp_account_request(p_company, p_name, p_phone, p_team_size, p_note)` (all text) | the request row as jsonb. Re-sending updates it and sets it back to pending. | any signed-in user |

**Super admin console**

| RPC | Returns | Who |
|---|---|---|
| `ramp_super_accounts()` | `{accounts: [...], requests: [...], platform}`. Each account has: plan, status, pause_reason, trial_ends, seat_limit, seats_used, notes, owner_email, workspaces count, workspace_list, members, placements and Stripe fields. | super |
| `ramp_super_approve(p_request uuid, p_plan text, p_trial_days int, p_seat_limit int)` | `{account_id, workspace_id}`. Creates the account and its first workspace, named after the company, with the library copy. The requester becomes owner and lands in it. For `p_seat_limit`, null means the platform default and 0 means unlimited. | super |
| `ramp_super_decline(p_request uuid, p_note text)` | void | super |
| `ramp_super_update_account(p_account uuid, p_plan, p_status, p_trial_ends date, p_seat_limit int, p_notes)` | void. Null leaves a field unchanged, and seat limit 0 means unlimited. Pausing sets `pause_reason = 'admin'`. | super |
| `ramp_super_platform_save(p_brand_name, p_brand_color, p_default_trial_days int, p_default_seat_limit int, p_workspace_limit int, p_stripe_prices jsonb, p_library_workspace uuid, p_agency_workspace uuid)` | the platform row. Null means unchanged; 0 means unlimited for the two limits. Each price is `{id, label, amount, interval: 'month'\|'year', seats?}`. | super |

**Agency ↔ client workspaces (008)**

| RPC | Returns | Who |
|---|---|---|
| `ramp_client_link(p_client uuid, p_workspace uuid)` | void. Links an agency client to its own workspace; null unlinks. Assistants sync automatically. | super, or an admin of the agency workspace. Workspace ids come from the super console. |
| `ramp_placement_sync(p_placement uuid)` | int (rows changed). Manual re-sync. Placement status changes and link changes already sync by trigger. | admins of the placement's workspace, or super |
| `ramp_client_invoices()` | jsonb array of issued invoices (never drafts): `id, client_id, number, status, period_start, period_end, issue_date, due_date, currency, total, paid_at, stripe_url, stripe_pdf, sent_at, created_at` | client contacts, and owners and admins of a linked client workspace |
| `ramp_client_invoice(p_id uuid)` | `{invoice, lines: [{id, kind, description, quantity, unit_price, amount, period_start, period_end, sort}], client: {name, billing_name, billing_email, billing_address, net_days}, issuer: {name, brand_color}}` | same |
| `ramp_my_client_info()` | `{id, name, linked}` or null | anyone |

**Service role only (009)**

These are for the edge functions written in the frontend phase.

| RPC | Returns |
|---|---|
| `ramp_account_set_stripe(p_account uuid, p_customer text)` | void |
| `ramp_account_subscription_event(p_customer text, p_subscription text, p_status text, p_period_end timestamptz, p_price text)` | `'ok'` or `'unknown customer'` |
| `ramp_account_billing_payload(p_account uuid)` | account, owner email, seats, Stripe ids and the price list |

Subscription status mapping:
- `active` or `trialing`: plan becomes `paid` and `trial_ends` is cleared. A billing pause is lifted. If the price has `seats`, those set `seat_limit` (null means unlimited).
- `past_due`, `unpaid`, `canceled`, `incomplete_expired` or `paused`: an active account is paused with `pause_reason = 'billing'`.
- Anything else is only recorded.
- Admin pauses and closed accounts are never changed by Stripe.

## Existing RPCs that behave differently

- `ramp_public_brand()` returns the platform brand (`RAMP`), not the company. The company brand still comes from `ramp_org` after sign-in.
- `ramp_my_roles().client` is now `{id, name, linked}`. `linked: true` means the caller is an owner or admin of a client's own workspace.
- `ramp_directory()` and `ramp_dm()` leave out support rows.
- The client functions also work from a linked client workspace: `ramp_client_portal`, `ramp_timesheet_review`, `ramp_client_feedback`, `ramp_client_request`, `ramp_step_toggle`, `ramp_launch_get`, `ramp_launch_save` and `ramp_launch_save_if`. Approvals made that way:
  - store `reviewed_by` / `by_member` / `updated_by` as null
  - write "(by Name, client)" in the agency's audit log
  - for client requests, append the sender's name and email to `body`
- `ramp_launch_role` may return `'client'` for a linked client admin, or `'va'` for the assistant from any workspace they're in.
- `ramp_request_access` files the request in the caller's current workspace, or in the agency workspace if they have none.
- `ramp_potential_staff()` lists hiring applicants and staff records only in the agency workspace. Access requests are listed in every workspace.
- `ramp_invite` and direct inserts into `ramp_members` fail with "All N seats on this plan are in use…" when the account is full.
  - Seats are distinct emails of active or invited members across the account's workspaces.
  - Client contacts, support rows and agency assistants don't count.
- `ramp_client_portal` is no longer `stable`. `supabase.rpc` uses POST, so nothing changes.
- `ramp_stripe_invoice_payload` now includes `invoice.workspace_id`.

## What the frontend must change

1. **Session gate** (`lib/session.tsx`).
   - Handle the new states. Today anything unknown falls through to `signed_out`.
   - Handle super admins with `workspace_id: null`.
   - Show a support banner when `support` is true.
2. **Workspace switcher.** Call `ramp_set_workspace(id)`, then restart the session and drop all cached data.
   - Re-subscribe realtime channels, since chat follows the current workspace.
   - Because the preference is per user, re-check `ramp_ws()` on window focus and reload if it changed.
3. **Resource uploads** (`admin/ResourcesAdmin.tsx`). Change the path to `resources/<workspace_id>/<uuid>-<name>`. The old flat `resources/<file>` path is now refused (there are no such files live). Use `workspace_id` from the session or `ramp_ws()`.
4. **Client invoices** (`client/ClientInvoices.tsx`, `client/ClientInvoice.tsx`). Read through `ramp_client_invoices()` and `ramp_client_invoice(id)` instead of selecting `ramp_invoices`, `ramp_invoice_lines` and `ramp_clients`.
   - A linked client admin can't read the agency's tables.
   - Take billing info from `.client`, and the seller name and colour from `.issuer`, not from `org`.
5. **Client portal for linked workspaces.** Owners and admins of a client's own workspace have rank 1–2, not 8, and their workspace has `flags.agency = false`.
   - Show the client pages (`/client`, hours, invoices, launch plans) when `roles.client?.linked` is true, next to their normal admin app.
   - Their placed assistants appear in their own People list as employees with `source = 'agency'`.
6. **Support rows** are hidden by RLS, so there's nothing to filter. Audit entries whose actor isn't in `ramp_members` should show "RAMP Support".
7. **New screens:**
   - sign-up request form and pending screen (`ramp_account_request`)
   - setup wizard (`workspace.setup_done`, `ramp_workspace_setup_done`)
   - "add organization" (`ramp_account_add_workspace`)
   - seats display (`ramp_seats`)
   - super admin console (`ramp_super_*`, client linking)
8. **Edge functions:**
   - `ramp-stripe` must check the invoice is in the caller's workspace before using the service key. Today it only checks `ramp_is_admin`. For example, read it as the user with `asUser.from('ramp_invoices').select('id').eq('id', invoice_id).maybeSingle()`, or compare `payload.invoice.workspace_id` with `asUser.rpc('ramp_ws')`. Without this, an admin of one workspace who learned another workspace's invoice id could send that invoice through Stripe. **Fix this before approving the first outside account.**
   - Service-role inserts must set `workspace_id` explicitly, because the default is null without a user.
   - New subscription functions should confirm that the caller owns the account (`ramp_my_workspaces().is_owner`, or a select on `ramp_accounts` as the user) before calling the service-role RPCs.
9. **Types** (`lib/types.ts`):
   - `workspace_id` on every `ramp_` row
   - `ramp_members.support` and `agency_placement_id`
   - `ramp_clients.linked_workspace_id`
   - the new platform tables `ramp_accounts`, `ramp_workspaces`, `ramp_platform`, `ramp_account_requests`, `ramp_user_prefs` and `ramp_super_admins`

## Notes

- Members can read their own account row, including `notes`. Keep private remarks out of `notes`.
- The library copy duplicates module blocks as they are. A block pointing at a file in a library member's storage folder won't open in the new workspace; use links or resource files instead.
- Platform tables (`ramp_accounts`, `ramp_workspaces`, `ramp_platform`) are readable through RLS as described above. Write to them only through the RPCs. The account owner may update `ramp_accounts.name` directly.
