# CareSpace

CareSpace is a first-revision static website for a real-time coordination layer connecting food, community need, capacity, and logistics.

The public brand and demo deployment target are:

**https://carespace.pages.dev**

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
- Role-aware dashboard prototype for people in need and food-bank operators
- Report-food, report-need, and report-capacity entry points
- Match flow: report → match → move → confirm
- Privacy/trust framing for community-level signals
- Public machine-readable declarations at `/capabilities.json` and `/.well-known/capabilities.json`
- Static build with no authoritative personal or case data

## Live map data

The network card loads [`public/network-data.json`](public/network-data.json) at runtime and renders latitude/longitude signals on a live Leaflet map using OpenStreetMap/CARTO tiles. The demo is scoped to San Diego County, California (`geoid` `0500000US06073`, FIPS `06073`); the map is locked to the county envelope and ignores signals outside it. It also requests the official 2020 Census TIGERweb county boundary when available. The data shape includes `location`, freshness fields, provenance, and a PUMA-compatible `geography` object nested under the county scope. PUMAs are Census geographic areas, so replace the demo `puma_geoid`, county bounds, and optional boundary data with authoritative sources before using production data.

To point the static site at a live JSON feed, set `VITE_NETWORK_DATA_URL` during the build. The demo intentionally uses fictional organization names and approximate locations.

The main map separately loads [`public/food-bank-locations.json`](public/food-bank-locations.json). This feed is normalized from [`san-diego-food-bank-locations.md`](san-diego-food-bank-locations.md) during `npm run dev` and `npm run build` by [`scripts/normalize-food-bank-data.mjs`](scripts/normalize-food-bank-data.mjs). Food-bank locations have their own `food-bank` type, filter, marker shape, popup provenance, and source fields so they remain distinct from live food, need, capacity, and logistics signals. Set `VITE_FOOD_BANK_DATA_URL` to replace the generated feed with another compatible JSON source.

The dashboard loads [`public/dashboard-data.json`](public/dashboard-data.json) and can be pointed at a live feed with `VITE_DASHBOARD_DATA_URL`. The current sign-in is a non-transmitting demo gate; connect the dashboard form to the selected production identity provider before accepting real credentials or user-specific data.

Google Maps can be used as a provider-specific follow-up by supplying a Google Maps JavaScript API key and map ID; the default map does not require a key or billing account.
