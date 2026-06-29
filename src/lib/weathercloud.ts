import { fetchWithTimeout } from "./http";
import { ReadingColumn } from "./reading";

const WC_EMAIL = process.env.WEATHERCLOUD_EMAIL!;
const WC_PASSWORD = process.env.WEATHERCLOUD_PASSWORD!;

// Module-level session cache. In serverless this survives warm invocations and
// is harmlessly rebuilt on cold starts. We never proactively probe it; instead
// an authed fetch that comes back as non-JSON triggers a single re-login + retry
// (see fetchWeathercloudAuthed), which avoids the extra request-per-collect the
// previous isSessionValid() probe incurred.
let cachedCookie: string | null = null;
let cachedCsrf: string | null = null;

function extractCookies(res: Response): Map<string, string> {
  const raw = res.headers.get("set-cookie");
  if (!raw) return new Map();
  const map = new Map<string, string>();
  for (const part of raw.split(/,(?=\s*\w+=)/)) {
    const cookie = part.split(";")[0].trim();
    const eqIdx = cookie.indexOf("=");
    if (eqIdx > 0) map.set(cookie.substring(0, eqIdx), cookie);
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
  const signinPage = await fetchWithTimeout("https://app.weathercloud.net/signin", {
    redirect: "manual",
  });
  const pageCookies = extractCookies(signinPage);

  const body = new URLSearchParams({
    "LoginForm[entity]": WC_EMAIL,
    "LoginForm[password]": WC_PASSWORD,
    "LoginForm[rememberMe]": "1",
    yt0: "",
  });

  const loginRes = await fetchWithTimeout("https://app.weathercloud.net/signin", {
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
  const redirectUrl = location.startsWith("http")
    ? location
    : `https://app.weathercloud.net${location}`;

  const followRes = await fetchWithTimeout(redirectUrl, {
    headers: { Cookie: cookieMapToString(merged) },
    redirect: "manual",
  });

  const finalCookies = new Map([...merged, ...extractCookies(followRes)]);
  cachedCsrf = getCsrfFromCookies(finalCookies);
  cachedCookie = cookieMapToString(finalCookies);
}

type PartialRow = Partial<Record<ReadingColumn, unknown>>;

function parseValues(text: string): PartialRow | null {
  if (!text.startsWith("{")) return null;
  let d: Record<string, number | undefined>;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof d.epoch !== "number") return null;

  return {
    observed_at: new Date(d.epoch * 1000).toISOString(),
    temp_c: d.temp ?? null,
    humidity: d.hum ?? null,
    dewpoint_c: d.dew ?? null,
    windchill_c: d.chill ?? null,
    heat_index_c: d.heat ?? null,
    // METAR stations report wind via wspdavg/wdiravg; PWS devices via wspd/wdir.
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

function valuesUrl(deviceId: string): string {
  // 4-letter codes (any case) are airport METAR stations on a different endpoint.
  const isMetar = /^[a-z]{4}$/i.test(deviceId);
  if (isMetar) {
    return `https://app.weathercloud.net/metar/values/${deviceId.toUpperCase()}`;
  }
  return `https://app.weathercloud.net/device/values/${encodeURIComponent(deviceId)}`;
}

/** Public station/METAR data — no authentication required. */
export async function fetchWeathercloudPublic(deviceId: string): Promise<PartialRow | null> {
  try {
    const res = await fetchWithTimeout(valuesUrl(deviceId), {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      cache: "no-store",
    });
    return parseValues(await res.text());
  } catch (err) {
    console.error(`Weathercloud public fetch failed for ${deviceId}:`, err);
    return null;
  }
}

/**
 * Authenticated fetch (needed for indoor temp/humidity on your own device).
 * Reuses the cached session; only logs in if the cached session is missing or
 * has expired (detected by a non-JSON response), then retries exactly once.
 */
export async function fetchWeathercloudAuthed(deviceId: string): Promise<PartialRow | null> {
  async function attempt(): Promise<string> {
    const headers: Record<string, string> = {
      Cookie: cachedCookie ?? "",
      "X-Requested-With": "XMLHttpRequest",
    };
    const csrfParam = cachedCsrf
      ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}`
      : "";
    const res = await fetchWithTimeout(`${valuesUrl(deviceId)}${csrfParam}`, {
      headers,
      cache: "no-store",
    });
    return res.text();
  }

  try {
    if (!cachedCookie) await login();
    let text = await attempt();

    if (!text.startsWith("{")) {
      // Session expired or missing — log in once and retry.
      await login();
      text = await attempt();
    }
    return parseValues(text);
  } catch (err) {
    console.error(`Weathercloud authed fetch failed for ${deviceId}:`, err);
    cachedCookie = null;
    cachedCsrf = null;
    return null;
  }
}
