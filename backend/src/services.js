import { seedPois } from "./data/pois.js";
import { fetchTrafficFromAmap, fetchWeatherFromAmap, fetchWeatherFromOpenMeteo } from "./external.js";

const pois = [...seedPois];

export function listPois() {
  return pois;
}

export function createPoi(payload) {
  const poi = {
    id: `poi-${Date.now()}`,
    name: payload.name,
    category: payload.category || "其他",
    level: payload.level || "4A",
    location: payload.location,
    openStatus: payload.openStatus || "OPEN",
    ticketRemain: payload.ticketRemain ?? 0,
    crowdLevel: payload.crowdLevel ?? 0.3,
    bestVisitTime: payload.bestVisitTime || "09:00-17:00",
    description: payload.description || ""
  };
  pois.push(poi);
  return poi;
}

export function updatePoi(id, payload) {
  const index = pois.findIndex((p) => p.id === id);
  if (index === -1) return null;
  pois[index] = { ...pois[index], ...payload };
  return pois[index];
}

export function removePoi(id) {
  const index = pois.findIndex((p) => p.id === id);
  if (index === -1) return false;
  pois.splice(index, 1);
  return true;
}

export async function getRealtime() {
  const now = new Date().toISOString();
  const remoteWeather = await fetchWeatherFromAmap();
  const remoteTraffic = await fetchTrafficFromAmap();

  return {
    generatedAt: now,
    weather: remoteWeather || {
      condition: "多云",
      temperature: 23,
      wind: "东北风 2级"
    },
    trafficSource: remoteTraffic?.source || "fallback",
    trafficSampledAt: remoteTraffic?.sampledAt || now,
    trafficRoads: remoteTraffic?.sampledRoads || [],
    trafficIndex: remoteTraffic?.trafficIndex || 1.35,
    alerts: remoteTraffic?.alerts || ["三峡大坝周边 17:00-18:30 车流偏高", "晚间局部阵雨，请携带雨具"],
    crowdHeat: pois.map((p) => ({ id: p.id, name: p.name, heat: Number((p.crowdLevel * 100).toFixed(1)) }))
  };
}

function scorePoi(poi, preference, timeBudgetHours, transportMode, tripDays) {
  const crowdPenalty = poi.crowdLevel * 12;
  const ticketBonus = Math.min(10, poi.ticketRemain / 500);

  let prefBonus = 0;
  if (preference === "亲子" && poi.category === "自然") prefBonus += 8;
  if (preference === "摄影" && ["自然", "工程"].includes(poi.category)) prefBonus += 9;
  if (preference === "文化" && poi.category === "人文") prefBonus += 10;
  if (preference === "轻松" && poi.crowdLevel < 0.5) prefBonus += 7;

  const modeBonus = transportMode === "公共交通" ? 2 : transportMode === "游船优先" ? 4 : 3;
  const timeFit = timeBudgetHours >= 8 ? 8 : 4;
  const dayBonus = Math.min(8, Math.max(0, tripDays - 1) * 2);
  return 60 + prefBonus + ticketBonus + timeFit + modeBonus + dayBonus - crowdPenalty;
}

function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function estimateTravelMinutes(distance, transportMode) {
  const speedByMode = {
    "驾车": 32,
    "公交+步行": 18,
    "游船+步行": 14
  };
  const speed = speedByMode[transportMode] || 20;
  return Math.max(20, Math.round((distance / speed) * 60));
}

function chooseMode(distance, preferred) {
  if (preferred === "驾车优先") return "驾车";
  if (preferred === "公共交通") return "公交+步行";
  if (preferred === "游船优先") return "游船+步行";
  if (distance > 25) return "驾车";
  if (distance > 12) return "公交+步行";
  return "游船+步行";
}

function optimizeItinerary(stops, input) {
  if (!stops.length) return stops;
  const startPoint = /东站/.test(input.start || "") ? { lat: 30.6998, lng: 111.4272 } : { lat: 30.7, lng: 111.29 };
  const days = Math.max(1, Number(input.tripDays || 1));
  const perDay = Math.max(1, Math.ceil(stops.length / days));
  const remaining = [...stops];
  const output = [];

  for (let day = 1; day <= days && remaining.length; day += 1) {
    let cursor = startPoint;
    let currentMinutes = 9 * 60;
    for (let k = 0; k < perDay && remaining.length; k += 1) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i += 1) {
        const dist = distanceKm(cursor, remaining[i].location);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const selected = remaining.splice(bestIdx, 1)[0];
      const mode = chooseMode(bestDist, input.transportMode || "混合");
      const travel = k === 0 ? 0 : estimateTravelMinutes(bestDist, mode);
      currentMinutes = k === 0 ? 9 * 60 : currentMinutes + travel;
      const hh = String(Math.floor(currentMinutes / 60)).padStart(2, "0");
      const mm = String(currentMinutes % 60).padStart(2, "0");
      output.push({
        day,
        poiId: selected.id,
        poiName: selected.name,
        arrival: `${hh}:${mm}`,
        stayMinutes: 110,
        travelMode: mode,
        reason: `距离上一站约${bestDist.toFixed(1)}km，结合${input.transportMode || "混合"}策略优化`
      });
      currentMinutes += 110;
      cursor = selected.location;
    }
  }
  return output;
}

function buildHeuristicPlan({ start, timeBudgetHours = 8, preference = "轻松", people = 2, transportMode = "混合", tripDays = 1 }) {
  const safeDays = Math.min(7, Math.max(1, Number(tripDays || 1)));
  const totalHours = Math.max(2, Number(timeBudgetHours || 8) * safeDays);
  const stopsCount = Math.min(pois.length, Math.max(safeDays * 2, Math.ceil(totalHours / 3)));
  const ranked = [...pois]
    .map((poi) => ({ poi, score: scorePoi(poi, preference, totalHours, transportMode, safeDays) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, stopsCount)
    .map((x) => x.poi);

  const optimized = optimizeItinerary(ranked, { start, tripDays: safeDays, transportMode });
  const itinerary = optimized.map((x, idx) => ({ order: idx + 1, ...x }));

  return {
    generatedAt: new Date().toISOString(),
    requestEcho: { start: start || "宜昌东站", timeBudgetHours: Number(timeBudgetHours || 8), tripDays: safeDays, preference, people, transportMode },
    summary: `从${start || "宜昌东站"}出发，推荐 ${safeDays} 天 ${itinerary.length} 站行程，适合${people}人出行。`,
    estimatedCostCNY: 180 * safeDays + itinerary.length * 90 + Number(people || 2) * 20,
    riskTips: ["中午时段热门景区排队较长", "建议提前30分钟到达换乘点"],
    itinerary
  };
}

function sanitizeModelPlan(rawPlan, input) {
  if (!rawPlan || !Array.isArray(rawPlan.itinerary)) return null;
  const safeDays = Math.min(7, Math.max(1, Number(input.tripDays || 1)));
  const itinerary = rawPlan.itinerary
    .map((x, idx) => {
      const poi = pois.find((p) => p.id === x.poiId) || pois.find((p) => p.name === x.poiName);
      if (!poi) return null;
      return {
        order: idx + 1,
        day: Math.min(safeDays, Math.max(1, Number(x.day || 1))),
        poiId: poi.id,
        poiName: poi.name,
        arrival: x.arrival || "09:00",
        stayMinutes: Math.max(60, Number(x.stayMinutes || 120)),
        travelMode: x.travelMode || "公交+步行",
        reason: x.reason || "AI综合实时拥挤度与偏好给出推荐"
      };
    })
    .filter(Boolean);
  if (!itinerary.length) return null;

  const selectedPois = itinerary
    .map((x) => pois.find((p) => p.id === x.poiId))
    .filter(Boolean);
  const optimized = optimizeItinerary(selectedPois, {
    start: input.start,
    tripDays: safeDays,
    transportMode: input.transportMode || "混合"
  }).map((x, idx) => ({ order: idx + 1, ...x }));

  return {
    generatedAt: new Date().toISOString(),
    requestEcho: {
      start: input.start || "宜昌东站",
      timeBudgetHours: Number(input.timeBudgetHours || 8),
      tripDays: safeDays,
      preference: input.preference || "轻松",
      people: Number(input.people || 2),
      transportMode: input.transportMode || "混合"
    },
    summary: rawPlan.summary || `AI已生成${safeDays}天智能行程，覆盖${itinerary.length}个景点。`,
    estimatedCostCNY: Math.max(180, Number(rawPlan.estimatedCostCNY || 0)),
    riskTips: Array.isArray(rawPlan.riskTips) && rawPlan.riskTips.length ? rawPlan.riskTips.slice(0, 4) : ["热门景区建议错峰出发"],
    itinerary: optimized
  };
}

async function planRouteWithModel(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const candidatePois = [...pois].map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    crowdLevel: p.crowdLevel,
    bestVisitTime: p.bestVisitTime,
    location: p.location
  }));

  const schemaHint = {
    summary: "string",
    estimatedCostCNY: 1200,
    riskTips: ["string"],
    itinerary: [{ day: 1, poiId: "poi-1", arrival: "09:00", stayMinutes: 120, travelMode: "驾车", reason: "string" }]
  };

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "你是宜昌旅游智能规划引擎。请严格只输出JSON，不要markdown，不要解释。行程必须符合天数、时长、偏好和交通方式，且只可使用提供的poiId。"
          },
          {
            role: "user",
            content: JSON.stringify({
              input,
              candidatePois,
              requiredOutputSchema: schemaHint
            })
          }
        ]
      })
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return sanitizeModelPlan(parsed, input);
  } catch {
    return null;
  }
}

export async function planRoute(input) {
  const aiPlan = await planRouteWithModel(input);
  if (aiPlan) return aiPlan;
  return buildHeuristicPlan(input);
}

function formatPlanAsText(plan) {
  const lines = [
    `行程建议（${plan.requestEcho.timeBudgetHours}小时，${plan.requestEcho.preference}，${plan.requestEcho.transportMode}）`,
    `出发地：${plan.requestEcho.start}`,
    `预估花费：¥${plan.estimatedCostCNY}`,
    "",
    "推荐路线："
  ];
  for (const stop of plan.itinerary) {
    lines.push(`${stop.order}. 第${stop.day}天 ${stop.arrival} ${stop.poiName}（${stop.travelMode}，停留${stop.stayMinutes}分钟）`);
  }
  lines.push("", "风险提示：");
  for (const tip of plan.riskTips) lines.push(`- ${tip}`);
  return lines.join("\n");
}

function tryParsePlanMessage(message, context) {
  const text = (message || "").trim();
  const routeIntent = /本次参数|规划|路线|行程/.test(text);
  if (!routeIntent) return null;

  const m = text.match(/本次参数[:：]\s*([^/]+)\s*\/\s*(\d+)\s*小时\s*\/\s*(\d+)\s*天\s*\/\s*([^/]+)\s*\/\s*([^/]+)\s*\/\s*(\d+)\s*人?/);
  if (m) {
    return {
      start: m[1].trim(),
      timeBudgetHours: Number(m[2]),
      tripDays: Number(m[3]),
      preference: m[4].trim(),
      transportMode: m[5].trim(),
      people: Number(m[6])
    };
  }

  // fallback to context-driven plan when user says "帮我规划"
  return {
    start: context?.start || "宜昌东站",
    timeBudgetHours: Number(context?.timeBudgetHours || 8),
    tripDays: Number(context?.tripDays || 1),
    preference: context?.preference || "轻松",
    transportMode: context?.transportMode || "混合",
    people: Number(context?.people || 2)
  };
}

function normalizeAnswer(text) {
  return (text || "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*---+\s*$/gm, "")
    .trim();
}

function localAnswer(message, context, locale) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("泄洪") || lower.includes("大坝")) {
    return {
      answer:
        locale === "en"
          ? "Check real-time announcement first, then visit Three Gorges Dam in the morning for better efficiency."
          : "建议先看实时公告，再安排三峡大坝行程。通常上午参观效率更高，可与坛子岭联游。",
      mapFocus: "poi-1"
    };
  }
  const hint = context?.preference
    ? locale === "en"
      ? `I remember your preference: ${context.preference}. `
      : `我记住你的偏好是${context.preference}。`
    : "";
  return {
    answer:
      locale === "en"
        ? `${hint}Pick 2-3 core spots and avoid long cross-area transfers. Share start point and available hours, I can generate a full route now.`
        : `${hint}建议优先选择2-3个核心景点，避免跨区频繁折返；若你告诉我出发地和可用时长，我可以立即生成具体路线。`,
    mapFocus: null
  };
}

function buildCrowdAnswer(message, locale) {
  const top = [...pois]
    .sort((a, b) => b.crowdLevel - a.crowdLevel)
    .slice(0, 5)
    .map((p, idx) => `${idx + 1}. ${p.name}：拥挤度 ${(p.crowdLevel * 100).toFixed(0)}%，门票余量 ${p.ticketRemain}`);

  const textZh = [
    "当前三峡相关景区客流参考（模拟+实时融合）：",
    ...top,
    "",
    "建议：若你想避开高峰，优先选择拥挤度低于50%的景点，并尽量在9:00前入园。"
  ].join("\n");

  const textEn = [
    "Current crowd snapshot for major Three Gorges spots:",
    ...top,
    "",
    "Tip: choose spots below 50% crowd level and enter before 9:00."
  ].join("\n");

  const focus =
    message.includes("大坝") ? "poi-1" : message.includes("人家") ? "poi-2" : message.includes("清江") ? "poi-3" : top[0] ? [...pois].sort((a, b) => b.crowdLevel - a.crowdLevel)[0].id : null;

  return {
    answer: locale === "en" ? textEn : textZh,
    mapFocus: focus
  };
}

async function buildRealtimeAnswer(locale) {
  const weather = (await fetchWeatherFromOpenMeteo()) || (await fetchWeatherFromAmap());
  const crowdTop = [...pois]
    .sort((a, b) => b.crowdLevel - a.crowdLevel)
    .slice(0, 3)
    .map((p) => `${p.name} ${(p.crowdLevel * 100).toFixed(0)}%`);

  if (locale === "en") {
    if (!weather) return { answer: "Realtime weather API is currently unavailable. Please try again later.", mapFocus: null };
    return {
      answer: [
        `Realtime update (${weather.source || "amap"}):`,
        `Weather: ${weather.condition}, ${weather.temperature}°C, wind ${weather.wind}`,
        `Top crowd spots: ${crowdTop.join(" / ")}`
      ].join("\n"),
      mapFocus: null
    };
  }

  if (!weather) {
    return { answer: "实时天气API暂时不可用，请稍后再试。", mapFocus: null };
  }

  return {
    answer: [
      `实时数据更新（来源：${weather.source || "高德"}）`,
      `天气：${weather.condition}，${weather.temperature}°C，风速${weather.wind}`,
      `高客流景点：${crowdTop.join(" / ")}`
    ].join("\n"),
    mapFocus: null
  };
}

async function callOpenAI(message, context, locale) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              locale === "en"
                ? "You are Yichang tourism assistant. Give concise practical tips and itinerary advice."
                : "你是宜昌旅游助手。请给出简洁、可执行的行程和交通建议。"
          },
          {
            role: "user",
            content: JSON.stringify({ message, context })
          }
        ]
      })
    });

    if (!resp.ok) return null;
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) return null;
    return { answer: text, mapFocus: null };
  } catch {
    return null;
  }
}

export async function chatWithAssistant({ message, context, locale = "zh" }) {
  if (/实时|天气|温度|风速/.test(message || "")) {
    return buildRealtimeAnswer(locale);
  }

  if (/客流|人流|拥挤|排队/.test(message || "")) {
    return buildCrowdAnswer(message || "", locale);
  }

  const planInput = tryParsePlanMessage(message, context);
  if (planInput) {
    const asyncPlan = await planRoute(planInput);
    return {
      answer: formatPlanAsText(asyncPlan),
      plan: asyncPlan,
      mapFocus: asyncPlan.itinerary[0]?.poiId || null
    };
  }

  const fromModel = await callOpenAI(message, context, locale);
  if (fromModel) return { ...fromModel, answer: normalizeAnswer(fromModel.answer) };
  return localAnswer(message, context, locale);
}