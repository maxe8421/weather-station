const WC_EMAIL = process.env.WEATHERCLOUD_EMAIL!;
const WC_PASSWORD = process.env.WEATHERCLOUD_PASSWORD!;

let cachedCookie: string | null = null;
let cachedCsrf: string | null = null;

function extractCookies(res: Response): Map<string, string> {
  const raw = res.headers.get("set-cookie");
  if (!raw) return new Map();
  const map = new Map<string, string>();
  for (const part of raw.split(/,(?=\s*\w+=)/)) {
    const cookie = part.split(";")[0].trim();
    const eqIdx = cookie.indexOf("=");
    if (eqIdx > 0) {
      map.set(cookie.substring(0, eqIdx), cookie);
    }
  }
  return map;
}

function cookieMapToString(map: Map<string, string>): string {
  return Array.from(map.values()).join("; ");
}

function getCsrfFromCookies(map: Map<string, string>): string | null {
  const csrf = map.get("WEATHERCLOUD_CSRF_TOKEN");
  if (!csrf) return null;
  return decodeURIComponent(csrf.split("=").slice(1).join("="));
}

async function login(): Promise<void> {
  const signinPage = await fetch("https://app.weathercloud.net/signin", {
    redirect: "manual",
  });
  const pageCookies = extractCookies(signinPage);

  const body = new URLSearchParams({
    "LoginForm[entity]": WC_EMAIL,
    "LoginForm[password]": WC_PASSWORD,
    "LoginForm[rememberMe]": "1",
    yt0: "",
  });

  const loginRes = await fetch("https://app.weathercloud.net/signin", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieMapToString(pageCookies),
    },
    body: body.toString(),
    redirect: "manual",
  });

  const loginCookies = extractCookies(loginRes);
  const merged = new Map([...pageCookies, ...loginCookies]);

  const location = loginRes.headers.get("location") || "https://app.weathercloud.net/";
  const redirectUrl = location.startsWith("http") ? location : `https://app.weathercloud.net${location}`;

  const followRes = await fetch(redirectUrl, {
    headers: { Cookie: cookieMapToString(merged) },
    redirect: "manual",
  });

  const followCookies = extractCookies(followRes);
  const finalCookies = new Map([...merged, ...followCookies]);

  cachedCsrf = getCsrfFromCookies(finalCookies);
  cachedCookie = cookieMapToString(finalCookies);
}

interface WCRow {
  observed_at: string;
  temp_c: number | null;
  humidity: number | null;
  dewpoint_c: number | null;
  windchill_c: number | null;
  heat_index_c: number | null;
  wind_speed_kph: number | null;
  wind_gust_kph: number | null;
  wind_dir: number | null;
  pressure_mb: number | null;
  precip_rate_mm: number | null;
  precip_total_mm: number | null;
  uv: number | null;
  solar_radiation: number | null;
  feels_like_c: number | null;
  temp_indoor_c: number | null;
  humidity_indoor: number | null;
}

function parseValues(text: string): WCRow | null {
  if (!text.startsWith("{")) return null;
  const d = JSON.parse(text);
  return {
    observed_at: new Date(d.epoch * 1000).toISOString(),
    temp_c: d.temp ?? null,
    humidity: d.hum ?? null,
    dewpoint_c: d.dew ?? null,
    windchill_c: d.chill ?? null,
    heat_index_c: d.heat ?? null,
    wind_speed_kph: d.wspd ?? d.wspdavg ?? null,
    wind_gust_kph: d.wspdhi ?? null,
    wind_dir: d.wdir ?? d.wdiravg ?? null,
    pressure_mb: d.bar ?? null,
    precip_rate_mm: d.rainrate ?? null,
    precip_total_mm: d.rain ?? null,
    uv: d.uvi ?? null,
    solar_radiation: d.solarrad ?? null,
    feels_like_c: d.chill ?? d.heat ?? d.temp ?? null,
    temp_indoor_c: d.tempin ?? null,
    humidity_indoor: d.humin ?? null,
  };
}

export async function fetchWeathercloudPublic(deviceId: string): Promise<WCRow | null> {
  try {
    // Try device endpoint first, then METAR endpoint for airport stations
    const isMetar = /^[A-Z]{4}$/.test(deviceId);
    const endpoint = isMetar ? "metar/values" : "device/values";
    const res = await fetch(
      `https://app.weathercloud.net/${endpoint}/${deviceId}`,
      { headers: { "X-Requested-With": "XMLHttpRequest" }, cache: "no-store" }
    );
    return parseValues(await res.text());
  } catch (err) {
    console.error("Weathercloud public fetch error:", err);
    return null;
  }
}

async function isSessionValid(): Promise<boolean> {
  if (!cachedCookie) return false;
  try {
    const testDeviceId = process.env.WEATHERCLOUD_DEVICE_ID!;
    const res = await fetch(
      `https://app.weathercloud.net/device/values/${testDeviceId}`,
      {
        headers: { Cookie: cachedCookie, "X-Requested-With": "XMLHttpRequest" },
        cache: "no-store",
      }
    );
    const text = await res.text();
    return text.startsWith("{") && text.includes("tempin");
  } catch {
    return false;
  }
}

export async function fetchWeathercloudAuthed(deviceId: string): Promise<WCRow | null> {
  try {
    if (!await isSessionValid()) {
      await login();
    }

    const headers: Record<string, string> = {
      Cookie: cachedCookie!,
      "X-Requested-With": "XMLHttpRequest",
    };
    const csrfParam = cachedCsrf ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}` : "";
    const res = await fetch(
      `https://app.weathercloud.net/device/values/${deviceId}${csrfParam}`,
      { headers, cache: "no-store" }
    );
    return parseValues(await res.text());
  } catch (err) {
    console.error("Weathercloud authed fetch error:", err);
    cachedCookie = null;
    cachedCsrf = null;
    return null;
  }
}
