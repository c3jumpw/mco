# RAMP

Training, onboarding and HR for the team. It replaces the ClickUp training space.

- **App:** Vite + React + Tailwind, deployed on Vercel as `mco-ramp`, with root directory `ramp/`.
- **Data:** the MKC-Admin Supabase project. Every table is prefixed `ramp_` and uses row-level security. Writes that need checks (documents, progress, invites, vault) go through `SECURITY DEFINER` functions.
- **Schema:** `supabase/migrations/001_ramp_schema.sql`. Starter content is in `002_ramp_seed.sql`.

## Access levels
Owner › Admin › Department lead › Mentor › Employee › Trainee › Guest. Levels are defined in `src/lib/util.ts` (`LEVELS`) and enforced in the database (`ramp_my_rank`, `ramp_can_see`).

## How people get in
1. An admin invites an email in **Admin › People**. Potential staff are listed there from hiring applications, staff records and access requests.
2. The person opens the RAMP link, chooses **New here**, and creates a login with that same email.
3. On first sign-in, `ramp_session_start()` links the login to the invitation, records the sign-in (IP and device are read from the request) and sends them into the welcome flow.

Anyone who signs up without an invitation can ask for access. Requests show up in **Admin › People**.

## Records
- Sensitive form fields and vault entries are encrypted with `pgp_sym_encrypt`. The key is stored in Supabase Vault as `ramp_field_key`.
- Every reveal of an encrypted value is written to `ramp_audit`.
- Submissions store the template version, typed signature, IP address and device.
- Files live in the private `ramp-files` bucket, under each member's id, and are opened through short-lived signed links.

## Develop
```
npm install
npm run dev        # needs VITE_SUPABASE_URL and VITE_SUPABASE_KEY, or uses the MKC-Admin defaults
npm run typecheck
npm run build
```

## Guide
The in-app guide lives at `/guide`. It's linked from the menu, the Admin portal and Resources, and shows each person only the sections for their access level.
- **Content:** `src/guide/guide.json`. Screenshots are in `public/guide-media/`, captured from the real screens with made-up data, with numbered callouts.
- **Layout and diagrams:** `src/guide/GuideView.tsx`.
- **Shareable copy:** `npm run build:guide` builds a standalone page into `dist-guide/` from the same component and content.
