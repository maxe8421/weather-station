-- =============================================================
-- Full schema for a fresh install. Run top-to-bottom in the
-- Supabase SQL Editor. (For an existing database, see the
-- "MIGRATION" block at the bottom for the incremental changes.)
-- =============================================================

create table stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wunderground_id text,
  latitude double precision,
  longitude double precision,
  is_primary boolean default false,
  source text not null default 'wunderground',
  source_id text,
  timezone text,
  country text,
  created_at timestamptz default now()
);

create table weather_readings (
  id bigint generated always as identity primary key,
  station_id uuid not null references stations(id) on delete cascade,
  observed_at timestamptz not null,
  temp_c double precision,
  humidity integer,
  dewpoint_c double precision,
  windchill_c double precision,
  heat_index_c double precision,
  wind_speed_kph double precision,
  wind_gust_kph double precision,
  wind_dir integer,
  pressure_mb double precision,
  precip_rate_mm double precision,
  precip_total_mm double precision,
  uv double precision,
  solar_radiation double precision,
  feels_like_c double precision,
  elevation double precision,
  temp_indoor_c double precision,
  humidity_indoor integer,
  unique(station_id, observed_at)
);

create index idx_readings_station_time on weather_readings(station_id, observed_at desc);
create index idx_readings_observed_at on weather_readings(observed_at desc);

-- Row-level security: public read, writes only via the service-role key.
alter table stations enable row level security;
alter table weather_readings enable row level security;

create policy "Allow public read on stations" on stations for select using (true);
create policy "Allow public read on weather_readings" on weather_readings for select using (true);

grant select on stations to anon;
grant select on weather_readings to anon;
grant all on stations to service_role;
grant all on weather_readings to service_role;

-- Daily aggregation done in SQL so long ranges (1y / all) never transfer or
-- truncate tens of thousands of raw rows. Wind direction uses a vector
-- (circular) mean; temperature carries min/avg/max for the summary chart.
create or replace function readings_daily(p_station_id uuid, p_from timestamptz)
returns table (
  day date,
  temp_avg double precision,
  temp_min double precision,
  temp_max double precision,
  temp_indoor_c double precision,
  feels_like_c double precision,
  dewpoint_c double precision,
  humidity double precision,
  humidity_indoor double precision,
  pressure_mb double precision,
  wind_speed_kph double precision,
  wind_gust_kph double precision,
  wind_dir double precision,
  precip_total_mm double precision,
  precip_rate_mm double precision,
  uv double precision,
  solar_radiation double precision,
  sunshine_hours double precision
)
language sql
stable
as $$
  -- "day" is the station's LOCAL calendar day (its IANA timezone), so daily
  -- buckets line up with the station's actual day rather than UTC midnight.
  select
    (observed_at at time zone coalesce(s.timezone, 'UTC'))::date as day,
    round(avg(temp_c)::numeric, 1)::float8,
    round(min(temp_c)::numeric, 1)::float8,
    round(max(temp_c)::numeric, 1)::float8,
    round(avg(temp_indoor_c)::numeric, 1)::float8,
    round(avg(feels_like_c)::numeric, 1)::float8,
    round(avg(dewpoint_c)::numeric, 1)::float8,
    round(avg(humidity)::numeric, 1)::float8,
    round(avg(humidity_indoor)::numeric, 1)::float8,
    round(avg(pressure_mb)::numeric, 1)::float8,
    round(avg(wind_speed_kph)::numeric, 1)::float8,
    round(max(wind_gust_kph)::numeric, 1)::float8,
    case when count(wind_dir) = 0 then null
      else ((degrees(atan2(avg(sind(wind_dir)), avg(cosd(wind_dir)))) + 360)::numeric % 360)::float8
    end,
    round(max(precip_total_mm)::numeric, 2)::float8,
    round(max(precip_rate_mm)::numeric, 2)::float8,
    round(avg(uv)::numeric, 1)::float8,
    round(avg(solar_radiation)::numeric, 0)::float8,
    -- Bright-sunshine hours: intervals at/above 120 W/m² (WMO threshold),
    -- estimated at the 10-minute collection cadence. Null when no solar sensor.
    case when count(solar_radiation) = 0 then null
      else round((count(*) filter (where solar_radiation >= 120) * 10.0 / 60.0)::numeric, 1)::float8
    end
  from weather_readings
  join stations s on s.id = weather_readings.station_id
  where weather_readings.station_id = p_station_id and observed_at >= p_from
  group by day
  order by day;
$$;

grant execute on function readings_daily(uuid, timestamptz) to anon, service_role;

-- Persisted daily rollup. Retains aggregated history indefinitely so long-range
-- charts keep working after raw rows are pruned, and lets the API transfer ~one
-- row per day instead of thousands of raw rows.
create table daily_readings (
  station_id uuid not null references stations(id) on delete cascade,
  day date not null,
  temp_avg double precision,
  temp_min double precision,
  temp_max double precision,
  temp_indoor_c double precision,
  feels_like_c double precision,
  dewpoint_c double precision,
  humidity double precision,
  humidity_indoor double precision,
  pressure_mb double precision,
  wind_speed_kph double precision,
  wind_gust_kph double precision,
  wind_dir double precision,
  precip_total_mm double precision,
  precip_rate_mm double precision,
  uv double precision,
  solar_radiation double precision,
  sunshine_hours double precision,
  primary key (station_id, day)
);

alter table daily_readings enable row level security;
create policy "Allow public read on daily_readings" on daily_readings for select using (true);
grant select on daily_readings to anon;
grant all on daily_readings to service_role;

-- Daily maintenance: refresh the rollup for every station/day, then delete raw
-- readings older than retention_days. security definer so it can prune.
create or replace function rollup_daily(retention_days int default 90)
returns json
language plpgsql
security definer
as $$
declare
  pruned int;
begin
  insert into daily_readings (
    station_id, day, temp_avg, temp_min, temp_max, temp_indoor_c, feels_like_c,
    dewpoint_c, humidity, humidity_indoor, pressure_mb, wind_speed_kph, wind_gust_kph, wind_dir,
    precip_total_mm, precip_rate_mm, uv, solar_radiation, sunshine_hours
  )
  select
    weather_readings.station_id,
    -- Station-local calendar day (see readings_daily).
    (observed_at at time zone coalesce(s.timezone, 'UTC'))::date as day,
    round(avg(temp_c)::numeric, 1)::float8,
    round(min(temp_c)::numeric, 1)::float8,
    round(max(temp_c)::numeric, 1)::float8,
    round(avg(temp_indoor_c)::numeric, 1)::float8,
    round(avg(feels_like_c)::numeric, 1)::float8,
    round(avg(dewpoint_c)::numeric, 1)::float8,
    round(avg(humidity)::numeric, 1)::float8,
    round(avg(humidity_indoor)::numeric, 1)::float8,
    round(avg(pressure_mb)::numeric, 1)::float8,
    round(avg(wind_speed_kph)::numeric, 1)::float8,
    round(max(wind_gust_kph)::numeric, 1)::float8,
    case when count(wind_dir) = 0 then null
      else ((degrees(atan2(avg(sind(wind_dir)), avg(cosd(wind_dir)))) + 360)::numeric % 360)::float8
    end,
    round(max(precip_total_mm)::numeric, 2)::float8,
    round(max(precip_rate_mm)::numeric, 2)::float8,
    round(avg(uv)::numeric, 1)::float8,
    round(avg(solar_radiation)::numeric, 0)::float8,
    case when count(solar_radiation) = 0 then null
      else round((count(*) filter (where solar_radiation >= 120) * 10.0 / 60.0)::numeric, 1)::float8
    end
  from weather_readings
  join stations s on s.id = weather_readings.station_id
  group by weather_readings.station_id, day
  on conflict (station_id, day) do update set
    temp_avg = excluded.temp_avg, temp_min = excluded.temp_min, temp_max = excluded.temp_max,
    temp_indoor_c = excluded.temp_indoor_c, feels_like_c = excluded.feels_like_c,
    dewpoint_c = excluded.dewpoint_c, humidity = excluded.humidity,
    humidity_indoor = excluded.humidity_indoor,
    pressure_mb = excluded.pressure_mb, wind_speed_kph = excluded.wind_speed_kph,
    wind_gust_kph = excluded.wind_gust_kph, wind_dir = excluded.wind_dir,
    precip_total_mm = excluded.precip_total_mm, precip_rate_mm = excluded.precip_rate_mm,
    uv = excluded.uv, solar_radiation = excluded.solar_radiation,
    sunshine_hours = excluded.sunshine_hours;

  delete from weather_readings
  where observed_at < (now() - make_interval(days => retention_days));
  get diagnostics pruned = row_count;

  return json_build_object('pruned', pruned);
end;
$$;

grant execute on function rollup_daily(int) to service_role;

-- Seed your primary station.
insert into stations (name, wunderground_id, source, source_id, is_primary)
values ('Kingston', 'IKINGS664', 'wunderground', 'IKINGS664', true);

-- =============================================================
-- MIGRATION (run only these on an already-deployed database that
-- predates this revision; the statements above already include them
-- for fresh installs):
--
--   alter table stations add column if not exists source text not null default 'wunderground';
--   alter table stations add column if not exists source_id text;
--   alter table stations add column if not exists timezone text;
--   alter table stations add column if not exists country text;
--   alter table weather_readings add column if not exists temp_indoor_c double precision;
--   alter table weather_readings add column if not exists humidity_indoor integer;
--   alter table stations drop constraint if exists stations_wunderground_id_key;
--   alter table daily_readings add column if not exists sunshine_hours double precision;
--   -- then re-run the readings_daily + rollup_daily create-or-replace functions
--   -- above (they now compute sunshine_hours), and run rollup_daily() once to
--   -- backfill the new column for existing days:
--   --   select rollup_daily();
--
--   -- Indoor humidity on the humidity chart: carry humidity_indoor through the
--   -- daily rollup (raw today/7d already select it via *). Add the column, then
--   -- re-run the readings_daily + rollup_daily create-or-replace functions above
--   -- (they now average humidity_indoor) and backfill it for existing days:
--   alter table daily_readings add column if not exists humidity_indoor double precision;
--   --   select rollup_daily(1000000);
--
--   -- Timezone-aware daily grouping: readings_daily and rollup_daily now bucket
--   -- by each station's LOCAL day (its IANA timezone) instead of UTC. Re-run both
--   -- create-or-replace functions above, then backfill WITHOUT pruning so the
--   -- persisted rollup is recomputed under the new day definition:
--   --   select rollup_daily(1000000);
--   -- Caveat: days older than the 90-day raw-retention window can't be recomputed
--   -- (their raw readings are already pruned) and keep their prior UTC grouping.
-- =============================================================
