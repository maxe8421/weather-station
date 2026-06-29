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

async function login(): Promise<string> {
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
  return cookieMapToString(finalCookies);
}

export interface WeathercloudData {
  tempin: number | null;
  humin: number | null;
}

export async function fetchWeathercloudIndoor(): Promise<WeathercloudData | null> {
  try {
    if (!cachedCookie) {
      cachedCookie = await login();
    }

    const headers: Record<string, string> = {
      Cookie: cachedCookie,
      "X-Requested-With": "XMLHttpRequest",
    };

    const csrfParam = cachedCsrf ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}` : "";
    let url = `https://app.weathercloud.net/device/values/${WC_DEVICE_ID}${csrfParam}`;

    let res = await fetch(url, { headers, cache: "no-store" });
    let text = await res.text();

    if (!text.startsWith("{")) {
      cachedCookie = null;
      cachedCookie = await login();
      headers.Cookie = cachedCookie;
      const csrfParam2 = cachedCsrf ? `?WEATHERCLOUD_CSRF_TOKEN=${encodeURIComponent(cachedCsrf)}` : "";
      url = `https://app.weathercloud.net/device/values/${WC_DEVICE_ID}${csrfParam2}`;
      res = await fetch(url, { headers, cache: "no-store" });
      text = await res.text();
    }

    if (!text.startsWith("{")) {
      return null;
    }

    const data = JSON.parse(text);
    return {
      tempin: data.tempin ?? null,
      humin: data.humin ?? null,
    };
  } catch (err) {
    console.error("Weathercloud error:", err);
    cachedCookie = null;
    cachedCsrf = null;
    return null;
  }
}
