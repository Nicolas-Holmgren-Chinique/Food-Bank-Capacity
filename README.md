# CareSpace

CareSpace is a first-revision static website for a real-time coordination layer connecting food, community need, capacity, and logistics.

The public brand and demo deployment target are:

**https://carespace.pages.dev**

The source concept is documented in [`docs/CareForce-Product-Requirements-Document-Revision-0.1.md`](docs/CareForce-Product-Requirements-Document-Revision-0.1.md). The public experience intentionally uses the CareSpace name while preserving the original PRD as an archived product reference.

## Demo dashboard access (POC)

Open the dashboard at **https://carespace.pages.dev/#dashboard** and use one of these intentionally public demo accounts:

For the interactive POC, no credentials are required: choose **Person in need**, **Food bank operator**, or **Food supplier** to open that role's dashboard. The credentials below remain available for direct API/authentication testing.

| Role | Email | Password | Organization |
| --- | --- | --- | --- |
| Food bank | `demo.foodbank@carespace.dev` | `CareSpace-FoodBank-2026!` | Central Care Food Bank |
| Food supplier | `demo.supplier@carespace.dev` | `CareSpace-Supplier-2026!` | Northside Market |

These credentials are for the demo only and must be replaced before production use.

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
- San Diego County food-bank layer sourced from the county-scoped D1 API, with a named fallback if the API is unavailable
- No-auth role picker that flips into distinct person-in-need, food-bank, and food-supplier dashboard views
- D1-backed dashboard registration and session login for people in need, food-bank operators, and food suppliers
- Report-food, report-need, and report-capacity entry points
- Match flow: report → match → move → confirm
- Privacy/trust framing for community-level signals
- Public machine-readable declarations at `/capabilities.json` and `/.well-known/capabilities.json`
- Static build with no authoritative personal or case data

## Allocation model

The About section links to the [The Indivisible Box — Allocation Framework](https://claude.ai/code/artifact/0380ce46-57db-4d47-82db-1a6902de62ed?via=auto_preview). The POC treats each ration as a whole box, finds the minimum usable capacity across storage dimensions, nets current inventory from need and free space, and uses a water-fill allocation to diagnose whether a site needs food, storage, or no further action.

## Live map data

The network card renders latitude/longitude signals on a live Leaflet map using OpenStreetMap/CARTO tiles. The demo is scoped to San Diego County, California (`geoid` `0500000US06073`, FIPS `06073`); the map is locked to the county envelope. Food-bank markers are loaded from `/api/v1/food-banks?limit=500`, which is county-filtered at the D1 layer, and the browser keeps a small named fallback for offline preview. Random marker generation is intentionally not used.

To point the static site at a live JSON feed, set `VITE_NETWORK_DATA_URL` during the build. The demo intentionally uses fictional organization names and approximate locations.

The main map reads food-bank locations from the D1-backed `/api/v1/food-banks` Pages Function. The endpoint returns the same normalized shape as [`public/food-bank-locations.json`](public/food-bank-locations.json), which is generated from [`san-diego-food-bank-locations.md`](san-diego-food-bank-locations.md) during `npm run dev` and `npm run build` by [`scripts/normalize-food-bank-data.mjs`](scripts/normalize-food-bank-data.mjs). The static feed remains a browser fallback while the API is unavailable. Food-bank locations have their own `food-bank` type, filter, marker shape, popup provenance, and source fields so they remain distinct from live food, need, capacity, and logistics signals. Set `VITE_FOOD_BANK_DATA_URL` to replace the API with another compatible JSON source.

The POC D1 food-bank schema and seed migration are in [`migrations/0001_food_bank_locations.sql`](migrations/0001_food_bank_locations.sql), generated with `npm run prepare:migration`; dashboard accounts and sessions are in [`migrations/0002_dashboard_users.sql`](migrations/0002_dashboard_users.sql). The Pages Functions use the `CARES_DB` binding configured in [`wrangler.toml`](wrangler.toml) and return only active records inside the San Diego County envelope.

Cloudflare D1 is a managed serverless SQLite database: this POC uses relational SQL tables for food-bank locations, dashboard users, and dashboard sessions. The dashboard map also includes fixed POC envelopes for common San Diego County cities; replace them with authoritative city boundaries when city-level GIS data is connected.

Dashboard auth endpoints are `/api/v1/dashboard/register`, `/api/v1/dashboard/login`, and `/api/v1/dashboard/session`. New registrations are stored in the same D1 database. Passwords are stored as PBKDF2-SHA-256 hashes and sessions use expiring HTTP-only cookies; replace this POC auth with the approved identity provider before production use.

The dashboard loads [`public/dashboard-data.json`](public/dashboard-data.json) and can be pointed at a live feed with `VITE_DASHBOARD_DATA_URL`. The dashboard auth in this revision is a D1-backed POC; connect it to the selected production identity provider before accepting real credentials or user-specific data.

Google Maps can be used as a provider-specific follow-up by supplying a Google Maps JavaScript API key and map ID; the default map does not require a key or billing account.
