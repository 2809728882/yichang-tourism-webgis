function pick(data, fallback) {
  return data === undefined || data === null || data === "" ? fallback : data;
}

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function wgs84ToGcj02(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function gcj02ToWgs84(lat, lng) {
  if (outOfChina(lat, lng)) return { lat, lng };
  const g = wgs84ToGcj02(lat, lng);
  return { lat: lat * 2 - g.lat, lng: lng * 2 - g.lng };
}

const trafficCache = {
  ts: 0,
  data: null
};
const poiMetricsCache = {
  ts: 0,
  data: null
};

export async function fetchWeatherFromAmap() {
  const key = process.env.AMAP_WEATHER_KEY;
  const city = process.env.AMAP_WEATHER_CITYCODE || "420500";
  if (!key) return null;

  try {
    const resp = await fetch(`https://restapi.amap.com/v3/weather/weatherInfo?key=${key}&city=${city}&extensions=base`);
    const json = await resp.json();
    const live = json?.lives?.[0];
    if (!live) return null;
    return {
      condition: pick(live.weather, "多云"),
      temperature: Number(pick(live.temperature, 23)),
      wind: `${pick(live.winddirection, "东北")}风 ${pick(live.windpower, "2")}级`
    };
  } catch {
    return null;
  }
}

function normalizePoiMetricsPayload(payload) {
  if (!payload) return {};
  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => {
      const key = String(item?.poiId || item?.id || item?.name || "").trim();
      if (!key) return acc;
      acc[key] = item;
      return acc;
    }, {});
  }
  if (Array.isArray(payload.items)) {
    return normalizePoiMetricsPayload(payload.items);
  }
  if (payload.items && typeof payload.items === "object") {
    return payload.items;
  }
  if (typeof payload === "object") return payload;
  return {};
}

export async function fetchRealPoiMetrics() {
  const endpoint = process.env.POI_REALTIME_ENDPOINT;
  if (!endpoint) return null;

  const now = Date.now();
  const ttlMs = Math.max(30, Number(process.env.POI_REALTIME_CACHE_SECONDS || 60)) * 1000;
  if (poiMetricsCache.data && now - poiMetricsCache.ts < ttlMs) {
    return poiMetricsCache.data;
  }

  try {
    const headers = {};
    if (process.env.POI_REALTIME_TOKEN) {
      headers.Authorization = `Bearer ${process.env.POI_REALTIME_TOKEN}`;
    }
    const resp = await fetch(endpoint, { headers });
    if (!resp.ok) return null;
    const json = await resp.json();
    const items = normalizePoiMetricsPayload(json);
    const data = {
      source: process.env.POI_REALTIME_SOURCE_NAME || "真实票务+闸机",
      sampledAt: new Date().toISOString(),
      items
    };
    poiMetricsCache.ts = now;
    poiMetricsCache.data = data;
    return data;
  } catch {
    return null;
  }
}

export async function fetchTrafficFromAmap() {
  const key = process.env.AMAP_TRAFFIC_KEY || process.env.AMAP_WEATHER_KEY;
  if (!key) return null;

  const now = Date.now();
  const ttlMs = 2 * 60 * 1000;
  if (trafficCache.data && now - trafficCache.ts < ttlMs) {
    return trafficCache.data;
  }

  const adcode = process.env.AMAP_TRAFFIC_ADCODE || process.env.AMAP_WEATHER_CITYCODE || "420500";
  const roadsRaw = process.env.AMAP_TRAFFIC_ROADS || "东山大道,发展大道,沿江大道,夷陵大道,西陵一路,港窑路";
  const roads = roadsRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!roads.length) {
    return {
      source: "amap-traffic-road",
      trafficIndex: 1.35,
      alerts: ["未配置道路名称（AMAP_TRAFFIC_ROADS）"]
    };
  }

  try {
    const statusWeight = { 未知: 2, 畅通: 1, 缓行: 2, 拥堵: 3, 严重拥堵: 4 };
    let scoreSum = 0;
    let count = 0;
    let failed = 0;
    const alerts = [];

    for (const roadName of roads) {
      const url =
        `https://restapi.amap.com/v3/traffic/status/road?key=${key}` +
        `&adcode=${encodeURIComponent(adcode)}` +
        `&name=${encodeURIComponent(roadName)}` +
        `&extensions=all`;
      const resp = await fetch(url);
      if (!resp.ok) {
        failed += 1;
        continue;
      }
      const json = await resp.json();
      if (json?.status !== "1") {
        failed += 1;
        continue;
      }

      const eva = json?.trafficinfo?.evaluation || {};
      const statusCode = String(eva.status || "2");
      const statusMap = { "1": "畅通", "2": "缓行", "3": "拥堵", "4": "严重拥堵" };
      const status = statusMap[statusCode] || eva.description || "未知";
      const w = statusWeight[status] ?? 2;
      scoreSum += w;
      count += 1;
      if (status === "拥堵" || status === "严重拥堵") {
        alerts.push(`${roadName}：${status}`);
      }
    }

    const allFailed = failed === roads.length;
    const avgScore = count ? scoreSum / count : 2;
    const finalAlerts = allFailed
      ? ["高德路况接口暂时不可用，已回退到默认交通指数（约2分钟后自动重试）"]
      : alerts.slice(0, 4).length
        ? alerts.slice(0, 4)
        : ["当前重点线路总体可通行"];

    const data = {
      source: "amap-traffic-road",
      trafficIndex: allFailed ? 1.35 : Number((0.8 + avgScore * 0.45).toFixed(2)),
      alerts: finalAlerts,
      sampledRoads: roads,
      sampledAt: new Date().toISOString()
    };

    trafficCache.ts = now;
    trafficCache.data = data;
    return data;
  } catch {
    const fallback = {
      source: "amap-traffic-road",
      trafficIndex: 1.35,
      alerts: ["高德路况接口网络异常，已使用默认交通指数"]
    };
    trafficCache.ts = now;
    trafficCache.data = fallback;
    return fallback;
  }
}

export async function fetchWeatherFromOpenMeteo() {
  const lat = 30.6919;
  const lon = 111.2865;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FShanghai`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const cur = json?.current;
    if (!cur) return null;

    const codeMap = {
      0: "晴",
      1: "晴间多云",
      2: "多云",
      3: "阴",
      45: "雾",
      48: "雾凇",
      51: "小毛雨",
      61: "小雨",
      63: "中雨",
      65: "大雨",
      80: "阵雨",
      95: "雷暴"
    };
    return {
      source: "open-meteo",
      condition: codeMap[cur.weather_code] || `天气代码${cur.weather_code}`,
      temperature: Number(cur.temperature_2m),
      wind: `${Number(cur.wind_speed_10m).toFixed(1)} km/h`,
      observedAt: cur.time
    };
  } catch {
    return null;
  }
}

export async function fetchWalkingDirection({ origin, destination }) {
  const key = process.env.AMAP_ROUTE_KEY || process.env.AMAP_TRAFFIC_KEY || process.env.AMAP_WEATHER_KEY;
  if (!key) {
    return { ok: false, error: "missing amap key" };
  }
  if (!origin || !destination) {
    return { ok: false, error: "origin and destination are required" };
  }

  try {
    const url =
      `https://restapi.amap.com/v3/direction/walking?key=${key}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}`;
    const resp = await fetch(url);
    if (!resp.ok) return { ok: false, error: `http ${resp.status}` };
    const json = await resp.json();
    if (json?.status !== "1") {
      return { ok: false, error: `${json?.info || "UNKNOWN"}(${json?.infocode || "N/A"})` };
    }

    const path = json?.route?.paths?.[0];
    const steps = Array.isArray(path?.steps) ? path.steps : [];
    return {
      ok: true,
      source: "amap-direction-walking",
      distance: Number(path?.distance || 0),
      duration: Number(path?.duration || 0),
      steps: steps.map((s, idx) => ({
        order: idx + 1,
        instruction: s?.instruction || "",
        road: s?.road || "",
        distance: Number(s?.distance || 0),
        polyline: s?.polyline || ""
      }))
    };
  } catch {
    return { ok: false, error: "network error" };
  }
}

function decodePolyline(polyline) {
  if (!polyline) return [];
  return polyline
    .split(";")
    .map((pair) => pair.split(",").map(Number))
    .filter((xy) => xy.length === 2 && Number.isFinite(xy[0]) && Number.isFinite(xy[1]))
    .map(([lng, lat]) => {
      const wgs = gcj02ToWgs84(lat, lng);
      return { lng: wgs.lng, lat: wgs.lat };
    });
}

export async function fetchDrivingDirection({ origin, destination }) {
  const key = process.env.AMAP_ROUTE_KEY || process.env.AMAP_TRAFFIC_KEY || process.env.AMAP_WEATHER_KEY;
  if (!key) return { ok: false, error: "missing amap key" };
  if (!origin || !destination) return { ok: false, error: "origin and destination are required" };

  try {
    const url =
      `https://restapi.amap.com/v3/direction/driving?key=${key}` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&extensions=base` +
      `&ferry=1`;
    const resp = await fetch(url);
    if (!resp.ok) return { ok: false, error: `http ${resp.status}` };
    const json = await resp.json();
    if (json?.status !== "1") return { ok: false, error: `${json?.info || "UNKNOWN"}(${json?.infocode || "N/A"})` };
    const path = json?.route?.paths?.[0];
    const steps = Array.isArray(path?.steps) ? path.steps : [];
    const geometry = [];
    for (const step of steps) {
      geometry.push(...decodePolyline(step?.polyline || ""));
    }
    return {
      ok: true,
      source: "amap-direction-driving",
      distance: Number(path?.distance || 0),
      duration: Number(path?.duration || 0),
      geometry
    };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export async function buildRoadGeometry(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, error: "at least 2 points required" };
  }
  const all = [];
  let totalDistance = 0;
  let totalDuration = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const oGcj = wgs84ToGcj02(points[i].lat, points[i].lng);
    const dGcj = wgs84ToGcj02(points[i + 1].lat, points[i + 1].lng);
    const o = `${oGcj.lng},${oGcj.lat}`;
    const d = `${dGcj.lng},${dGcj.lat}`;
    const seg = await fetchDrivingDirection({ origin: o, destination: d });
    if (!seg.ok || !Array.isArray(seg.geometry) || !seg.geometry.length) {
      // fallback segment as straight short line
      all.push({ lng: points[i].lng, lat: points[i].lat }, { lng: points[i + 1].lng, lat: points[i + 1].lat });
      continue;
    }
    totalDistance += seg.distance || 0;
    totalDuration += seg.duration || 0;
    if (all.length && seg.geometry.length) {
      all.push(...seg.geometry.slice(1));
    } else {
      all.push(...seg.geometry);
    }
  }
  return { ok: true, source: "amap-direction-driving", distance: totalDistance, duration: totalDuration, geometry: all };
}