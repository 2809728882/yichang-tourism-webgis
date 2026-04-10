import fs from "fs/promises";
import path from "path";

const dataDir = path.resolve(process.cwd(), "src", "data");
const itineraryFile = path.join(dataDir, "itineraries.json");
const feedbackFile = path.join(dataDir, "feedback.json");

async function ensureFile(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }
}

async function load(filePath, fallback) {
  await ensureFile(filePath, fallback);
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

async function save(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function listItineraries(userId) {
  const db = await load(itineraryFile, { items: [] });
  return db.items.filter((x) => x.userId === userId);
}

export async function createItinerary(payload) {
  const db = await load(itineraryFile, { items: [] });
  const item = {
    id: `it-${Date.now()}`,
    userId: payload.userId,
    title: payload.title || "未命名行程",
    plan: payload.plan || null,
    createdAt: new Date().toISOString()
  };
  db.items.push(item);
  await save(itineraryFile, db);
  return item;
}

export async function removeItinerary(userId, itineraryId) {
  const db = await load(itineraryFile, { items: [] });
  const before = db.items.length;
  db.items = db.items.filter((x) => !(x.userId === userId && x.id === itineraryId));
  if (db.items.length === before) return false;
  await save(itineraryFile, db);
  return true;
}

export async function createFeedback(payload) {
  const db = await load(feedbackFile, { items: [] });
  const item = {
    id: `fb-${Date.now()}`,
    userId: payload.userId || "anonymous",
    rating: Number(payload.rating || 5),
    comment: payload.comment || "",
    imageUrls: Array.isArray(payload.imageUrls) ? payload.imageUrls : [],
    createdAt: new Date().toISOString()
  };
  db.items.push(item);
  await save(feedbackFile, db);
  return item;
}

export async function getDashboardStats() {
  const itineraries = await load(itineraryFile, { items: [] });
  const feedback = await load(feedbackFile, { items: [] });
  const avgRating = feedback.items.length
    ? feedback.items.reduce((acc, x) => acc + Number(x.rating || 0), 0) / feedback.items.length
    : 0;

  return {
    itineraryCount: itineraries.items.length,
    feedbackCount: feedback.items.length,
    averageRating: Number(avgRating.toFixed(2))
  };
}