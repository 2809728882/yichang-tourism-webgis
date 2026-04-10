import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  chatWithAssistant,
  createPoi,
  getRealtime,
  listPois,
  planRoute,
  removePoi,
  updatePoi
} from "./services.js";
import { createFeedback, createItinerary, getDashboardStats, listItineraries, removeItinerary } from "./store.js";
import { buildRoadGeometry, fetchWalkingDirection } from "./external.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

const configuredOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const allowedOrigins = new Set([
  configuredOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:888",
  "http://127.0.0.1:888"
]);

app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser requests without Origin header
      if (!origin) return callback(null, true);
      return callback(null, allowedOrigins.has(origin));
    }
  })
);
app.use(express.json());

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token !== (process.env.ADMIN_TOKEN || "demo-admin-token")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "yichang-webgis-backend", timestamp: new Date().toISOString() });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  const ok =
    username === (process.env.ADMIN_USERNAME || "admin") &&
    password === (process.env.ADMIN_PASSWORD || "123456");
  if (!ok) return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: process.env.ADMIN_TOKEN || "demo-admin-token", role: "admin" });
});

app.get("/api/pois", (_req, res) => {
  res.json({ items: listPois() });
});

app.get("/api/realtime", async (_req, res) => {
  const data = await getRealtime();
  res.json(data);
});

app.post("/api/plan-route", async (req, res) => {
  const { start, timeBudgetHours, tripDays, preference, people, transportMode } = req.body || {};
  const result = await planRoute({ start, timeBudgetHours, tripDays, preference, people, transportMode });
  res.json(result);
});

app.post("/api/chat", async (req, res) => {
  const { message, context, locale } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }
  const result = await chatWithAssistant({ message, context, locale });
  res.json(result);
});

app.get("/api/route/walking", async (req, res) => {
  const { origin, destination } = req.query;
  const result = await fetchWalkingDirection({ origin, destination });
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/route/geometry", async (req, res) => {
  const points = Array.isArray(req.body?.points) ? req.body.points : [];
  const result = await buildRoadGeometry(points);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get("/api/user/:userId/itineraries", async (req, res) => {
  const items = await listItineraries(req.params.userId);
  res.json({ items });
});

app.post("/api/user/:userId/itineraries", async (req, res) => {
  const item = await createItinerary({ userId: req.params.userId, title: req.body?.title, plan: req.body?.plan });
  res.status(201).json(item);
});

app.delete("/api/user/:userId/itineraries/:id", async (req, res) => {
  const ok = await removeItinerary(req.params.userId, req.params.id);
  if (!ok) return res.status(404).json({ error: "itinerary not found" });
  res.status(204).send();
});

app.post("/api/feedback", async (req, res) => {
  const item = await createFeedback(req.body || {});
  res.status(201).json(item);
});

app.get("/api/admin/pois", requireAdmin, (_req, res) => {
  res.json({ items: listPois() });
});

app.post("/api/admin/pois", requireAdmin, (req, res) => {
  if (!req.body?.name || req.body?.location?.lat === undefined || req.body?.location?.lng === undefined) {
    return res.status(400).json({ error: "name and location(lat,lng) are required" });
  }
  const poi = createPoi(req.body);
  res.status(201).json(poi);
});

app.put("/api/admin/pois/:id", requireAdmin, (req, res) => {
  const updated = updatePoi(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "poi not found" });
  res.json(updated);
});

app.delete("/api/admin/pois/:id", requireAdmin, (req, res) => {
  const ok = removePoi(req.params.id);
  if (!ok) return res.status(404).json({ error: "poi not found" });
  res.status(204).send();
});

app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
  const stats = await getDashboardStats();
  res.json(stats);
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});