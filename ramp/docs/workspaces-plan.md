# Plan: RAMP for client businesses (workspaces)

These decisions were made with the owner on 2026-11-17.

**Goal:** RAMP becomes a product that client businesses use for their own hiring and onboarding. The MKC agency layer plugs into it.

## Decisions
- **Sign-up:** clients can sign up, and the account stays *pending* until the super admin approves it and picks a plan.
- **Plans:** Free (comp), Trial or Paid. During testing there's no billing; comp accounts get free access.
- **Agency VAs:** VAs placed with a client appear inside that client's workspace, next to the client's own staff, along with the launch plan, hours and invoices.
- **Starter content:** a new workspace starts with a copy of the MKC library (modules, document templates, Day 1 agenda), ready to edit.
- **Order:** finish and ship the agency layer first, then build workspaces.

## Shape
- **Super admin** (platform owner, above every workspace):
  - accounts, approvals and plans
  - seat limits, pause or close
  - usage
  - view-as for support
- **Account** (a client business):
  - one or more **organizations (workspaces)**, with a switcher
  - an account owner who can add organizations
- **Workspace:** today's single-org RAMP, scoped per workspace. That means org settings, departments, roles, modules, templates, people, chat, resources and records.
- **Isolation:**
  - Every `ramp_` table gets `workspace_id`. Its default comes from the current workspace, which the app sends as a request header and the database checks against membership.
  - RLS filters by workspace membership, so most screens need no rewrite.
- **Migration:** existing MKC rows move into workspace #1, and MKC's agency tables link to client workspaces.

## Phases
1. Workspace foundation and migration.
2. Super admin console.
3. Sign-up, approval and the setup wizard, including the library copy.
4. Multiple organizations per account.
5. Placed VAs shown inside client workspaces.
6. Stripe subscriptions, after testing.
