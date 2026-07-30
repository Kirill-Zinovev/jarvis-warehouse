# Jarvis on Cloudflare

## Deploy from GitHub

Use Cloudflare Workers → Create application → Import a repository, then select this GitHub repository.

Recommended settings:

- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Node version: `20` or newer

Required setup:

- Create a D1 database named `jarvis-warehouse` and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`.
- Generate/apply the Prisma migration with `npx prisma migrate dev --name init`, then apply it to D1 with `npx wrangler d1 migrations apply jarvis-warehouse --remote`.
- `DATABASE_URL` is only used for local development; production uses the `DB` D1 binding.
- Add the VLM provider credentials required by `z-ai-web-dev-sdk` as encrypted Worker secrets.

## Local Cloudflare preview

```bash
npm install
npm run cf:build
npm run cf:preview
```

The project uses the OpenNext Cloudflare adapter, Wrangler, and the `nodejs_compat` compatibility flag. Do not commit `.env` or database files.
