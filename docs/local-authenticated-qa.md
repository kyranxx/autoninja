# Local authenticated QA data

AutoNinja's authenticated account states must be tested without creating fake
users, listings, saved searches, or conversations in production. The local QA
seeder creates two repeatable Supabase users and deterministic account data:

- a seller with active, draft, and sold listings;
- a buyer with a saved listing and saved search;
- a two-message buyer/seller conversation;
- long labels, high mileage, promotion, VAT, and inactive-state examples.

## Safety boundary

The seeder accepts only `http://localhost:54321`, `http://127.0.0.1:54321`, or
the IPv6 loopback equivalent. It rejects hosted Supabase domains, HTTPS targets,
other hosts, and other ports before a client is created.

## Run locally

1. Start Docker Desktop.
2. Run `npx supabase start`.
3. Read the local `API URL` and `service_role key` from
   `npx supabase status -o env`.
4. In the same PowerShell session, set:

   ```powershell
   $env:QA_SUPABASE_URL = "http://127.0.0.1:54321"
   $env:QA_SUPABASE_SERVICE_ROLE_KEY = "<local service_role key>"
   $env:QA_ACCOUNT_PASSWORD = "<optional local password, at least 10 characters>"
   npm run qa:seed:local
   ```

If `QA_ACCOUNT_PASSWORD` is omitted, the local-only default is
`AutoNinja-QA-Local-2026!`.

The accounts are `qa.seller@autoninja.local` and
`qa.buyer@autoninja.local`. Running the seeder again updates the same users and
rows instead of adding duplicates.
