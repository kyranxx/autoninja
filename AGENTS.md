# AutoNinja project rules

## Multi-market production workflow

- AutoNinja uses one shared codebase for `autoninja.sk`, `autoninja.ro`, and future market domains.
- Completed changes should be deployed to live production by default so the user can inspect them on the real site; do not stop at a local-only result unless the user explicitly asks for that.
- Do not assume that every experimental change must immediately be translated and deployed to every domain.
- For shared experimental work, use `autoninja.sk` as the default production canary unless the task is specifically for another market.
- When the user authorizes a production experiment, deploy it only to the canary market first, iterate there, and keep the other market on its last approved version.
- Translate changed user-visible copy and deploy the same approved revision to the other markets only after the user accepts the experiment.
- Market-specific work should be translated and deployed only for the affected market.
- Shared changes without new visible text normally require no translation.
- Database migrations used during staggered deployments must remain compatible with both the older and newer application versions.
- Always report clearly which domains were deployed, which commit/version each domain is running, and whether the markets are temporarily out of sync.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
