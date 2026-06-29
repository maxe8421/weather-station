create table stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wunderground_id text not null unique,
  latitude double precision,
  longitude double precision,
  is_primary boolean default false,
  source text not null default 'wunderground',
  source_id text,
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
  unique(station_id, observed_at)
);

create index idx_readings_station_time on weather_readings(station_id, observed_at desc);
create index idx_readings_observed_at on weather_readings(observed_at desc);

-- RLS policies
alter table stations enable row level security;
alter table weather_readings enable row level security;

create policy "Allow public read on stations" on stations for select using (true);
create policy "Allow public read on weather_readings" on weather_readings for select using (true);

grant select on stations to anon;
grant select on weather_readings to anon;
grant all on stations to service_role;
grant all on weather_readings to service_role;

-- Insert primary station
insert into stations (name, wunderground_id, is_primary)
values ('My Station', 'IKINGS664', true);
