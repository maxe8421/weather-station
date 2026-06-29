const WC_EMAIL = process.env.WEATHERCLOUD_EMAIL!;
const WC_PASSWORD = process.env.WEATHERCLOUD_PASSWORD!;
const WC_DEVICE_ID = process.env.WEATHERCLOUD_DEVICE_ID!;

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

async function ensureLoggedIn(): Promise<void> {
  if (cachedCookie) return;

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

export interface WeathercloudValues {
  epoch: number;
  tempin: number | null;
  humin: number | null;
  temp: number | null;
  hum: number | null;
  dew: number | null;
  dewin: number | null;
  chill: number | null;
  heat: number | null;
  heatin: number | null;
  bar: number | null;
  wspd: number | null;
  wspdhi: number | null;
  wdir: number | null;
  wspdavg: number | null;
  wdiravg: number | null;
  rainrate: number | null;
  rain: number | null;
  solarrad: number | null;
  uvi: number | null;
}

async function fetchDeviceValues(deviceId: string): Promise<WeathercloudValues | null> {
  try {
    await ensureLoggedIn();

    const headers: Record<string, string> = {
      Cookie: cachedCookie!,
      "X-Requested-With": "XMLHttpRequest",
    };

    const csrfParam = cachedCsrf ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}` : "";
    let url = `https://app.weathercloud.net/device/values/${deviceId}${csrfParam}`;

    let res = await fetch(url, { headers, cache: "no-store" });
    let text = await res.text();

    if (!text.startsWith("{")) {
      cachedCookie = null;
      await ensureLoggedIn();
      headers.Cookie = cachedCookie!;
      const csrfParam2 = cachedCsrf ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}` : "";
      url = `https://app.weathercloud.net/device/values/${deviceId}${csrfParam2}`;
      res = await fetch(url, { headers, cache: "no-store" });
      text = await res.text();
    }

    if (!text.startsWith("{")) {
      return null;
    }

    return JSON.parse(text);
  } catch (err) {
    console.error("Weathercloud error:", err);
    cachedCookie = null;
    cachedCsrf = null;
    return null;
  }
}

export interface WeathercloudIndoorData {
  tempin: number | null;
  humin: number | null;
}

export async function fetchWeathercloudIndoor(): Promise<WeathercloudIndoorData | null> {
  const data = await fetchDeviceValues(WC_DEVICE_ID);
  if (!data) return null;
  return { tempin: data.tempin ?? null, humin: data.humin ?? null };
}

export async function fetchWeathercloudStation(deviceId: string) {
  const data = await fetchDeviceValues(deviceId);
  if (!data) return null;

  return {
    observed_at: new Date(data.epoch * 1000).toISOString(),
    temp_c: data.temp,
    humidity: data.hum,
    dewpoint_c: data.dew,
    windchill_c: data.chill,
    heat_index_c: data.heat,
    wind_speed_kph: data.wspd,
    wind_gust_kph: data.wspdhi,
    wind_dir: data.wdir,
    pressure_mb: data.bar,
    precip_rate_mm: data.rainrate,
    precip_total_mm: data.rain,
    uv: data.uvi,
    solar_radiation: data.solarrad,
    feels_like_c: data.chill ?? data.heat ?? data.temp,
    temp_indoor_c: data.tempin,
    humidity_indoor: data.humin,
  };
}
