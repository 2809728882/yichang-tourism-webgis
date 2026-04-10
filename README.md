# 瀹滄父鏅哄浘锛圷ichang Tourism WebGIS锛塒RD澧炲己鐗?

鍩轰簬浣犵殑PRD鍗囩骇鍚庣殑鍙繍琛岀増鏈紝鏂板锛?

- 鍙厤缃閮ˋPI閫傞厤灞傦紙楂樺痉澶╂皵/浜ら€氾級
- AI闂瓟涓嫳鍙岃鏀寔锛堝彲鎺ュ叆OpenAI锛?- 鐢ㄦ埛涓績锛氭垜鐨勮绋嬩繚瀛?璇诲彇銆佸弽棣堟彁浜?- 鍚庡彴绠＄悊锛氱鐞嗗憳鐧诲綍銆佺粺璁℃暟鎹帴鍙?

## 鐩綍缁撴瀯

- `backend`锛歂ode.js + Express API
- `frontend`锛歊eact + Vite WebGIS 鍓嶇

## 蹇€熷惎鍔?

### 1) 鍚姩鍚庣

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

鍚庣榛樿绔彛锛歚3010`

### 2) 鍚姩鍓嶇

```bash
cd frontend
npm install
npm run dev
```

鍓嶇榛樿绔彛锛歚888`

璁块棶锛歚[[http://127.0.0.1:888`](http://127.0.0.1:888`)](http://127.0.0.1:888`](http://127.0.0.1:888`))

## 鐜鍙橀噺锛堝悗绔級

```bash
PORT=3001
FRONTEND_ORIGIN=http://127.0.0.1:888

ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
ADMIN_TOKEN=demo-admin-token

AMAP_WEATHER_KEY=
AMAP_TRAFFIC_KEY=
AMAP_WEATHER_CITYCODE=420500

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
```

璇存槑锛?

- 鏈厤缃?`AMAP_*` 鏃讹紝绯荤粺浣跨敤鍐呯疆瀹炴椂妯℃嫙鏁版嵁銆?- 鏈厤缃?`OPENAI_API_KEY` 鏃讹紝绯荤粺浣跨敤瑙勫垯鍥炲銆?

## API娓呭崟

### 娓稿绔?

- `GET /api/health`
- `GET /api/pois`
- `GET /api/realtime`
- `POST /api/plan-route`
- `POST /api/chat`
- `GET /api/user/:userId/itineraries`
- `POST /api/user/:userId/itineraries`
- `POST /api/feedback`

### 绠＄悊绔?

- `POST /api/admin/login`
- `GET /api/admin/pois` (Bearer)
- `POST /api/admin/pois` (Bearer)
- `PUT /api/admin/pois/:id` (Bearer)
- `DELETE /api/admin/pois/:id` (Bearer)
- `GET /api/admin/stats` (Bearer)

## 鍏抽敭鏀归€犺鏄?

- 褰撳墠浠嶄娇鐢ㄥ唴瀛楶OI涓嶫SON鏂囦欢瀛樺偍鐢ㄦ埛鏁版嵁锛屽悗缁彲鍒囨崲鍒?PostgreSQL/PostGIS銆?- 宸蹭繚鐣欑湡瀹炲閮ˋPI鎺ュ叆鐐癸紝鎷垮埌Key鍗冲彲鍚敤銆?- 宸叉敮鎸佷腑鑻卞弻璇棶绛斿弬鏁帮紙`locale: zh/en`锛夈€?

