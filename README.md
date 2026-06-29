# Weather Station Dashboard

A self-hosted dashboard that collects observations from personal and public weather stations, stores them **permanently** in Postgres, and visualises them with interactive charts. It exists to solve a specific problem: Weather Underground and Weathercloud only retain a rolling 30–60 days of history. This project polls those services every 10 minutes and keeps the data forever, so you can look back over months and years rather than weeks.

It is built to run on Vercel's free tier with a free Supabase Postgres database and a free external cron trigger, so ongoing hosting cost is £0.

## Features

- **Permanent history** — every reading is stored in Postgres with no retention limit, removing the 30/60-day cap imposed by the upstream services.
- **Multi-source ingestion** — pulls from the Weather Underground PWS API, public Weathercloud devices, and Weathercloud METAR (airport) stations.
- **Indoor metrics** — captures indoor temperature and humidity for your own station by authenticating against Weathercloud (data the public APIs do not expose).
- **Multi-station** — track any number of stations worldwide; add or remove them from a password-protected management page.
- **Overview home page** — a card per station showing current outdoor temperature, indoor temperature (where available), 1-hour average wind speed, and rainfall.
- **Per-station dashboard** — current-conditions cards plus time-series charts for temperature (outdoor/indoor/dew point), humidity, pressure, wind speed, rainfall, wind direction, and UV/solar radiation.
- **Adaptive aggregation** — raw 10-minute points for 24h, hourly averages for 7d, daily averages for 30d and longer; temperature additionally shows daily min/avg/max.
- **Auto-refresh** — the UI re-polls every 60 seconds with no manual reload.
- **Health monitoring** — a `/api/health` endpoint returns HTTP 500 when any station's data goes stale, designed to drive email alerts from an external cron monitor.
- **Metric units throughout** — °C, km/h, hPa, mm.
- **Forced light theme** — consistent appearance regardless of the viewer's OS dark-mode setting.

## Tech Stack

- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts 3
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Scheduling:** external cron (e.g. cron-job.org) — Vercel's free cron is limited to once per day, which is too coarse for 10-minute polling
- **Data sources:** Weather Underground PWS API, Weathercloud (device + METAR endpoints)

## Prerequisites & Installation

### Prerequisites

- Node.js 18 or newer (the project was built and tested on Node 24) and npm
- A free [Supabase](https://supabase.com) project
- A Weather Underground PWS API key (free for station owners)
- A Weathercloud account (only needed for indoor data)

### 1. Clone and install

```bash
git clone https://github.com/maxe8421/weather-station.git
cd weather-station
npm install
```

### 2. Create the database

In the Supabase dashboard open the **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates the `stations` and `weather_readings` tables, the indexes, the row-level-security read policies, and inserts your primary station.

### 3. Configure environment variables

Create `.env.local` in the project root:

```bash
WUNDERGROUND_API_KEY=your_wu_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
CRON_SECRET=any_long_random_string
WEATHERCLOUD_EMAIL=you@example.com
WEATHERCLOUD_PASSWORD=your_weathercloud_password
WEATHERCLOUD_DEVICE_ID=your_numeric_weathercloud_device_id
```

| Variable | Where to find it | Purpose |
|----------|------------------|---------|
| `WUNDERGROUND_API_KEY` | wunderground.com account | Authenticates PWS API calls |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Project URL (same value) |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` | Server-side writes (bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` | Browser-side reads (RLS enforced) |
| `CRON_SECRET` | invent one | Protects `/api/collect` and admin actions |
| `WEATHERCLOUD_*` | your Weathercloud account | Fetches indoor data for the primary station |

> The `service_role` key and Weathercloud password are secrets — keep them server-side only. `.env.local` is gitignored.

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000.

## Usage Examples

### Trigger a data collection manually

```bash
curl "http://localhost:3000/api/collect?secret=YOUR_CRON_SECRET"
# {"results":[{"station":"IKINGS664","status":"ok"}, ...]}
```

### Read stored readings for a station

```bash
curl "http://localhost:3000/api/readings?station_id=<uuid>&range=7d"
```

`range` accepts `24h`, `7d`, `30d`, `1y`, `all`.

### Add a station (admin only)

```bash
# Weather Underground
curl -X POST http://localhost:3000/api/stations \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_CRON_SECRET" \
  -d '{"name":"London Heathrow","source":"wunderground","station_id":"ILONDO489"}'

# Weathercloud device or METAR (e.g. CYZE)
curl -X POST http://localhost:3000/api/stations \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_CRON_SECRET" \
  -d '{"name":"Gore Bay","source":"weathercloud","station_id":"CYZE"}'
```

### Check health

```bash
curl -i http://localhost:3000/api/health
# 200 {"status":"healthy","stations":6}  — or 500 with an "issues" list
```

### Deploy and schedule

1. Push to GitHub and import the repo into Vercel.
2. Add all environment variables from `.env.local` to the Vercel project.
3. On [cron-job.org](https://cron-job.org), create a job hitting
   `https://<your-app>.vercel.app/api/collect?secret=YOUR_CRON_SECRET` every 10 minutes.
4. Create a second job hitting `https://<your-app>.vercel.app/api/health` every 30 minutes with "notify on failure" enabled.

## Testing

There is no automated test suite yet; the cases below from the QA report are run manually with `curl` against a local `npm run dev` server and a seeded database.

```bash
# 1. Auth rejection — expect 401
curl -i "http://localhost:3000/api/collect?secret=wrong"

# 5. Missing station_id — expect 400
curl -i "http://localhost:3000/api/readings"

# 8. Add station without admin secret — expect 401
curl -i -X POST http://localhost:3000/api/stations \
  -H "Content-Type: application/json" \
  -d '{"name":"x","source":"wunderground","station_id":"IKINGS664"}'

# 12. Health when data is stale — expect 500 with issues[]
curl -i "http://localhost:3000/api/health"
```

A production hardening pass should add a runner (Vitest or Jest) covering: the `range`→date-window mapping and row limits in `/api/readings`; circular wind averaging and year-aware bucketing in `src/lib/utils.ts`; the Wunderground and Weathercloud/METAR field mapping; and the auth guards on `/api/collect` and `/api/stations`.

## Architecture / Project Structure

```
weather-station/
├── supabase/
│   └── schema.sql              # Tables, indexes, RLS policies, seed station
├── src/
│   ├── app/
│   │   ├── page.tsx            # Home: station overview cards (auto-refresh)
│   │   ├── layout.tsx          # Root layout, forced light theme
│   │   ├── globals.css         # Tailwind entry + base styles
│   │   ├── station/[id]/
│   │   │   └── page.tsx        # Per-station detail route
│   │   ├── stations/
│   │   │   └── page.tsx        # Password-gated add/remove stations UI
│   │   └── api/
│   │       ├── collect/route.ts   # Cron target: fetch all sources → upsert
│   │       ├── readings/route.ts  # Time-ranged reads for charts
│   │       ├── latest/route.ts    # Per-station latest + 1h avg wind
│   │       ├── stations/route.ts  # List (public) / add / delete (admin)
│   │       └── health/route.ts    # Staleness check for monitoring
│   ├── components/
│   │   ├── Dashboard.tsx          # Orchestrates a station's detail view
│   │   ├── CurrentConditions.tsx  # Current-reading metric cards
│   │   ├── WeatherChart.tsx       # All chart panels + aggregation wiring
│   │   ├── StationPicker.tsx      # Station dropdown
│   │   └── TimeRangeSelector.tsx  # 24h/7d/30d/1y/all toggle
│   └── lib/
│       ├── supabase.ts            # Lazy admin (service) + public (anon) clients
│       ├── wunderground.ts        # WU PWS API fetch + row mapping
│       ├── weathercloud.ts        # Public + authed fetch, login/session, METAR
│       ├── utils.ts               # Time formatting, daily/hourly aggregation, wind compass
│       └── types.ts               # Station / WeatherReading / TimeRange types
```

### Data flow

1. **cron-job.org** calls `GET /api/collect?secret=…` every 10 minutes.
2. `collect` loads all stations, fetches each from the right source (`wunderground.ts` for WU, `weathercloud.ts` for Weathercloud/METAR), and authenticates to Weathercloud once to attach indoor temperature/humidity to the primary station.
3. Rows are **upserted** into `weather_readings` keyed on `(station_id, observed_at)`, so repeated polls never create duplicates.
4. The browser reads through `/api/latest` (home) and `/api/readings` (detail) using the public anon key; row-level security allows read-only access.
5. Charts aggregate the returned rows by the selected time range before rendering.

### Security model

- **Writes** go through the `service_role` key, which lives only in server environment variables and never reaches the browser.
- **Reads** use the `anon` key with RLS `select`-only policies — safe to expose since the dashboard is intentionally public.
- **Mutations** (`/api/collect`, station add/delete) require the `CRON_SECRET` / `x-admin-secret`.

> See the QA report for known limitations being tracked, including row-limit truncation on `/api/readings`, oldest-first results on long ranges, and moving the collection secret out of the URL query string.
