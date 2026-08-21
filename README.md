# CareSpace

CareSpace is a first-revision static website for a real-time coordination layer connecting food, community need, capacity, and logistics.

The public brand and deployment target are:

**https://carespace.heurchain.com**

The source concept is documented in [`docs/CareForce-Product-Requirements-Document-Revision-0.1.md`](docs/CareForce-Product-Requirements-Document-Revision-0.1.md). The public experience intentionally uses the CareSpace name while preserving the original PRD as an archived product reference.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

The output is written to `dist/` and is suitable for Cloudflare Pages Direct Upload.

## Deployment

The repository is configured to deploy only from `master` to the isolated Cloudflare Pages project named `carespace`. Merging a pull request into `master` triggers `.github/workflows/deploy.yml`.

Add these repository Actions secrets before the first production deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — an account-scoped token with Cloudflare Pages edit permission

The existing `heurchain` Pages project is intentionally not referenced by the workflow.

## Product surface

- Live-signal network map with supply, demand, capacity, and logistics filters
- Report-food, report-need, and report-capacity entry points
- Match flow: report → match → move → confirm
- Privacy/trust framing for community-level signals
- Public machine-readable declarations at `/capabilities.json` and `/.well-known/capabilities.json`
- Static build with no authoritative personal or case data
