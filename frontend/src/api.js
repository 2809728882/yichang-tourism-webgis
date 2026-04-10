const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const fallbackBases = [
  "http://127.0.0.1:3001/api",
  "http://localhost:3001/api",
  "http://127.0.0.1:3020/api",
  "http://localhost:3020/api",
  "http://127.0.0.1:3010/api",
  "http://localhost:3010/api"
];
const BASES = configuredBase ? [configuredBase, ...fallbackBases.filter((x) => x !== configuredBase)] : fallbackBases;

async function request(path, options = {}) {
  let lastNetworkError = null;
  for (const base of BASES) {
    try {
      const resp = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || "Request failed");
      }
      if (resp.status === 204) return null;
      return resp.json();
    } catch (err) {
      // Network failure: try next candidate base.
      if (err?.message?.includes("Failed to fetch")) {
        lastNetworkError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastNetworkError || new Error("Failed to fetch");
}

export const api = {
  getPois: () => request("/pois"),
  getRealtime: () => request("/realtime"),
  planRoute: (body) => request("/plan-route", { method: "POST", body: JSON.stringify(body) }),
  chat: (body) => request("/chat", { method: "POST", body: JSON.stringify(body) }),
  routeGeometry: (points) => request("/route/geometry", { method: "POST", body: JSON.stringify({ points }) }),
  saveItinerary: (userId, body) => request(`/user/${userId}/itineraries`, { method: "POST", body: JSON.stringify(body) }),
  listItineraries: (userId) => request(`/user/${userId}/itineraries`),
  deleteItinerary: (userId, id) => request(`/user/${userId}/itineraries/${id}`, { method: "DELETE" }),
  submitFeedback: (body) => request("/feedback", { method: "POST", body: JSON.stringify(body) })
};