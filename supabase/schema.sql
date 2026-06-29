-- Run this in your Supabase SQL Editor to set up the database

create table stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wunderground_id text not null unique,
  latitude double precision,
  longitude double precision,
  is_primary boolean default false,
  created_at timestamptz default now()
);

create table weather_readings (
  id bigint generated always as identity primary key,
  station_id uuid not null references stations(id) on delete cascade,
  observed_at timestamptz not null,
  temp_f double precision,
  temp_c double precision,
  humidity integer,
  dewpoint_f double precision,
  dewpoint_c double precision,
  windchill_f double precision,
  windchill_c double precision,
  heat_index_f double precision,
  heat_index_c double precision,
  wind_speed_mph double precision,
  wind_gust_mph double precision,
  wind_dir integer,
  pressure_in double precision,
  pressure_mb double precision,
  precip_rate_in double precision,
  precip_total_in double precision,
  uv double precision,
  solar_radiation double precision,
  feels_like_f double precision,
  feels_like_c double precision,
  visibility_mi double precision,
  elevation double precision,
  unique(station_id, observed_at)
);

create index idx_readings_station_time on weather_readings(station_id, observed_at desc);
create index idx_readings_observed_at on weather_readings(observed_at desc);

-- Insert your primary station
insert into stations (name, wunderground_id, is_primary)
values ('My Station', 'IKINGS664', true);
