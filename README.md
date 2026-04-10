# 宜游智图 WebGIS

面向宜昌游客的 WebGIS + AI 智能旅游系统（移动端优先）。

## 当前能力

- 地图主视图：POI、客流热度、路线编号点、真实道路线路绘制
- AI 路线规划：支持天数、时长、偏好、交通模式、人数
- AI 智能问答：普通问答 + 客流问答 + 实时天气问答
- 实时信息：天气、交通指数、路况来源与告警
- 行程中心：保存行程、查看、再次应用、删除
- 新手引导：3 步生成首条路线
- 移动端适配：左侧功能面板 + 地图主视图 + 悬浮信息卡

## 技术栈

- 前端：React + Vite + Leaflet
- 后端：Node.js + Express
- 外部服务：高德 API（天气、路况、路径）、Open-Meteo（免费天气备选）
- AI：OpenAI 兼容接口（可配置 DeepSeek）

## 目录结构

- `frontend`：前端工程
- `backend`：后端 API
- `docker-compose.yml`：容器化启动模板

## 本地启动

### 1) 启动后端

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

默认端口：`3001`

### 2) 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认端口：`888`

访问地址：`http://127.0.0.1:888/`

## 后端环境变量（示例）

```bash
PORT=3001
FRONTEND_ORIGIN=http://127.0.0.1:888

ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
ADMIN_TOKEN=demo-admin-token

AMAP_WEATHER_KEY=
AMAP_TRAFFIC_KEY=
AMAP_WEATHER_CITYCODE=420500
AMAP_TRAFFIC_ADCODE=420500
AMAP_TRAFFIC_ROADS=东山大道,发展大道,沿江大道,夷陵大道,西陵一路,港窑路

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=deepseek-chat
```

## 主要 API

- `GET /api/health`
- `GET /api/pois`
- `GET /api/realtime`
- `POST /api/plan-route`
- `POST /api/chat`
- `POST /api/route/geometry`（真实道路几何）
- `GET /api/user/:userId/itineraries`
- `POST /api/user/:userId/itineraries`
- `DELETE /api/user/:userId/itineraries/:id`
- `POST /api/feedback`

## 说明

- 若高德路况接口异常，系统会自动降级并给出可读提示。
- 若 AI 服务不可用，路线规划会自动回退到启发式方案。
- 生产环境请确保 `.env` 不入库，避免泄露密钥。