import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import MapView from "./components/MapView";

const defaultPlanInput = {
  start: "宜昌东站",
  timeBudgetHours: 8,
  tripDays: 1,
  preference: "轻松",
  people: 2,
  transportMode: "混合"
};

export default function App() {
  const [pois, setPois] = useState([]);
  const [realtime, setRealtime] = useState(null);
  const [planInput, setPlanInput] = useState(defaultPlanInput);
  const [planResult, setPlanResult] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [focusPoiId, setFocusPoiId] = useState(null);
  const [activePoiId, setActivePoiId] = useState(null);
  const [locale, setLocale] = useState("zh");
  const [userId] = useState("guest-001");
  const [myTrips, setMyTrips] = useState([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [uiError, setUiError] = useState("");
  const [replanEnabled, setReplanEnabled] = useState(true);
  const [plannerMode, setPlannerMode] = useState("newbie");
  const [plannerCollapsed, setPlannerCollapsed] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [routeLine, setRouteLine] = useState([]);

  useEffect(() => {
    async function init() {
      const [poiResp, rtResp, myTripResp] = await Promise.all([
        api.getPois(),
        api.getRealtime(),
        api.listItineraries(userId)
      ]);
      setPois(poiResp.items || []);
      setRealtime(rtResp);
      setMyTrips(myTripResp.items || []);
      localStorage.setItem("cached_realtime", JSON.stringify(rtResp || {}));
    }
    init().catch((err) => {
      const cachedRealtime = JSON.parse(localStorage.getItem("cached_realtime") || "null");
      const cachedPlan = JSON.parse(localStorage.getItem("cached_plan") || "null");
      if (cachedRealtime) setRealtime(cachedRealtime);
      if (cachedPlan) setPlanResult(cachedPlan);
      alert(`初始化失败: ${err.message}`);
    });
  }, [userId]);

  const options = useMemo(() => ["亲子", "摄影", "文化", "轻松"], []);
  const transportOptions = useMemo(() => ["混合", "公共交通", "游船优先", "驾车优先"], []);
  const quickPrompts = useMemo(() => ["带老人适合去哪？", "下雨天备选景点", "三峡客流量", "东站2天轻松路线"], []);

  const routePath = useMemo(() => {
    if (!planResult?.itinerary?.length) return [];
    return planResult.itinerary
      .map((stop) => ({ stop, poi: pois.find((p) => p.id === stop.poiId) }))
      .filter((x) => Boolean(x.poi))
      .map(({ stop, poi }) => ({ lat: poi.location.lat, lng: poi.location.lng, order: stop.order, name: stop.poiName }));
  }, [planResult, pois]);

  useEffect(() => {
    async function buildRoadLine() {
      if (!routePath.length) {
        setRouteLine([]);
        return;
      }
      try {
        const points = routePath.map((p) => ({ lat: p.lat, lng: p.lng }));
        const geometry = await api.routeGeometry(points);
        const line = Array.isArray(geometry?.geometry) ? geometry.geometry.map((x) => ({ lat: x.lat, lng: x.lng })) : [];
        setRouteLine(line.length ? line : routePath);
      } catch {
        setRouteLine(routePath);
      }
    }
    buildRoadLine();
  }, [routePath]);

  async function handlePlan(nextInput = planInput) {
    setUiError("");
    setLoadingPlan(true);
    try {
      const res = await api.planRoute(nextInput);
      setPlanResult(res);
      setPlannerCollapsed(true);
      if (res?.itinerary?.[0]?.poiId) {
        setFocusPoiId(res.itinerary[0].poiId);
        setActivePoiId(res.itinerary[0].poiId);
      }
      localStorage.setItem("cached_plan", JSON.stringify(res || {}));
    } catch (err) {
      setUiError(`路线规划失败：${err.message}`);
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleSmartReplan() {
    const next = { ...planInput, preference: "轻松", transportMode: "公共交通" };
    setPlanInput(next);
    await handlePlan(next);
  }

  async function handleSavePlan() {
    if (!planResult) return;
    const payload = { title: `${planInput.preference}行程`, plan: planResult };
    await api.saveItinerary(userId, payload);
    const latest = await api.listItineraries(userId);
    setMyTrips(latest.items || []);
  }

  async function handleDeleteTrip(id) {
    try {
      await api.deleteItinerary(userId, id);
      setMyTrips((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setUiError(`删除行程失败：${err.message}`);
    }
  }

  async function handleFeedback() {
    await api.submitFeedback({ userId, rating: 5, comment: "路线实用，地图交互清晰" });
    alert("反馈提交成功");
  }

  async function handleChat(customText) {
    const text = (customText ?? chatInput).trim();
    if (!text || loadingChat) return;
    setUiError("");
    setChatLog((prev) => [...prev, { role: "user", text }]);
    if (!customText) setChatInput("");
    setLoadingChat(true);
    try {
      const payload = { message: text, context: { ...planInput }, locale };
      const res = await api.chat(payload);
      setChatLog((prev) => [...prev, { role: "assistant", text: res.answer }]);
      if (res.plan) setPlanResult(res.plan);
      if (res.mapFocus) {
        setFocusPoiId(res.mapFocus);
        setActivePoiId(res.mapFocus);
      }
    } catch (err) {
      setUiError(`AI问答失败：${err.message}`);
      setChatLog((prev) => [...prev, { role: "assistant", text: "请求失败，请检查后端是否启动和端口配置。" }]);
    } finally {
      setLoadingChat(false);
    }
  }

  const trafficWarning = (realtime?.alerts || []).join("\n");

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <div className="header compact">
          <h1>宜游智图 WebGIS</h1>
          <p>AI智能规划 + 实时地图</p>
          <div className="locale-row">
            <span>语言</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <section className="panel-card">
          <div className="panel-title-row">
            <h2>AI智能规划</h2>
            <button className="text-btn" onClick={() => setPlannerCollapsed((v) => !v)}>{plannerCollapsed ? "展开" : "收起"}</button>
          </div>

          {!plannerCollapsed ? (
            <>
              <div className="steps-row" style={{ marginBottom: 10 }}>
                <span className={plannerMode === "newbie" ? "step-active" : "step"} onClick={() => setPlannerMode("newbie")}>新手3步</span>
                <span className={plannerMode === "advanced" ? "step-active" : "step"} onClick={() => setPlannerMode("advanced")}>高级条件</span>
              </div>

              <label>出发地</label>
              <input value={planInput.start} onChange={(e) => setPlanInput({ ...planInput, start: e.target.value })} />

              <div className="inline-fields">
                <div>
                  <label>游玩天数</label>
                  <input type="number" min={1} max={7} value={planInput.tripDays} onChange={(e) => setPlanInput({ ...planInput, tripDays: Number(e.target.value) })} />
                </div>
                <div>
                  <label>可用时长(小时/天)</label>
                  <input type="number" min={2} max={16} value={planInput.timeBudgetHours} onChange={(e) => setPlanInput({ ...planInput, timeBudgetHours: Number(e.target.value) })} />
                </div>
              </div>

              <label>偏好</label>
              <select value={planInput.preference} onChange={(e) => setPlanInput({ ...planInput, preference: e.target.value })}>
                {options.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>

              {plannerMode === "advanced" ? (
                <>
                  <label>交通模式</label>
                  <select value={planInput.transportMode} onChange={(e) => setPlanInput({ ...planInput, transportMode: e.target.value })}>
                    {transportOptions.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <label>人数</label>
                  <input type="number" min={1} max={20} value={planInput.people} onChange={(e) => setPlanInput({ ...planInput, people: Number(e.target.value) })} />
                </>
              ) : null}

              <button onClick={() => handlePlan()} disabled={loadingPlan}>{loadingPlan ? "规划中..." : "一键生成路线"}</button>
            </>
          ) : null}

          {planResult ? (
            <div className="timeline-wrap">
              <div className="condensed-bar">
                {planResult.requestEcho?.start} | {planResult.requestEcho?.tripDays}天 | {planResult.requestEcho?.preference}
                <button className="text-btn" onClick={() => setPlannerCollapsed(false)}>修改条件</button>
              </div>
              <div className="timeline">
                {planResult.itinerary.map((item) => (
                  <div key={item.order} className="timeline-item" onClick={() => setActivePoiId(item.poiId)}>
                    <div className="timeline-dot" />
                    <div>
                      <div className="timeline-title">第{item.day}天 {item.arrival} · {item.poiName}</div>
                      <div className="timeline-sub">{item.travelMode}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleSavePlan}>保存行程</button>
            </div>
          ) : null}
        </section>

        <section className="panel-card">
          <h2>AI智能问答</h2>
          <div className="prompt-tags">
            {quickPrompts.map((p) => <button key={p} className="tag-btn" onClick={() => handleChat(p)}>{p}</button>)}
          </div>
          <div className="chat-box">
            {chatLog.length === 0 ? <div className="msg-assistant">欢迎使用宜游智图，你可以试试上方快捷提问。</div> : null}
            {chatLog.map((item, idx) => (
              <div key={`${item.role}-${idx}`} className={item.role === "user" ? "msg-user" : "msg-assistant"}>{item.role === "user" ? "你：" : "助手："}{item.text}</div>
            ))}
          </div>
          <div className="chat-input-row">
            <textarea rows={2} placeholder="输入问题..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button onClick={() => handleChat()} disabled={loadingChat}>{loadingChat ? "发送中" : "发送"}</button>
          </div>
        </section>

        <section className="panel-card">
          <h2>我的行程</h2>
          <ul className="trip-list">
            {myTrips.map((x) => (
              <li key={x.id}>
                <span>{x.title}</span>
                <div className="trip-actions">
                  <button className="icon-btn" onClick={() => { setPlanResult(x.plan); setPlannerCollapsed(true); }}>查看</button>
                  <button className="icon-btn" onClick={() => { setPlanResult(x.plan); setPlanInput({ ...planInput, ...(x.plan?.requestEcho || {}) }); }}>再次应用</button>
                  <button className="icon-btn" onClick={() => handleDeleteTrip(x.id)}>删除</button>
                </div>
              </li>
            ))}
          </ul>
          <button className="secondary-btn" onClick={handleFeedback}>意见反馈</button>
        </section>

        {uiError ? <div className="panel-card"><p style={{ color: "#dc2626", margin: 0 }}>{uiError}</p></div> : null}
      </aside>

      <main className="map-stage">
        <MapView
          pois={pois}
          focusPoiId={focusPoiId}
          activePoiId={activePoiId}
          heatData={realtime?.crowdHeat}
          routePath={routePath}
          routeLine={routeLine}
        />

        <div className="realtime-widget">
          <div className="widget-title">实时信息</div>
          <div>天气：{realtime?.weather?.condition || "--"} {realtime?.weather?.temperature ?? "--"}°C</div>
          <div>
            交通指数：{realtime?.trafficIndex ?? "--"}
            {trafficWarning ? <span className="warn" title={trafficWarning}> ⚠️</span> : null}
          </div>
          <label className="replan-toggle">
            <input type="checkbox" checked={replanEnabled} onChange={(e) => setReplanEnabled(e.target.checked)} />
            实时重规划
          </label>
          {replanEnabled && Number(realtime?.trafficIndex || 0) >= 1.6 ? <button onClick={handleSmartReplan}>拥堵，重规划</button> : null}
        </div>

        <div className="floating-actions">
          <button onClick={() => setShowSafety(true)}>避坑提醒</button>
          <button onClick={() => setShowOffline(true)}>离线应急包</button>
        </div>

        {showSafety ? (
          <div className="overlay-panel">
            <div className="overlay-card">
              <h3>避坑与安全提醒</h3>
              <ul>
                <li>拒绝黑车，优先网约车与官方接驳。</li>
                <li>热门景区提前预约门票与时段。</li>
                <li>天气突变时减少山地徒步。</li>
              </ul>
              <a href="https://www.mct.gov.cn/" target="_blank" rel="noreferrer">官方入口</a>
              <button onClick={() => setShowSafety(false)}>关闭</button>
            </div>
          </div>
        ) : null}

        {showOffline ? (
          <div className="overlay-panel">
            <div className="overlay-card">
              <h3>离线应急包</h3>
              <p>弱网可用：已缓存行程与天气。</p>
              <ul>
                <li>急救：120</li>
                <li>报警：110</li>
                <li>旅游咨询：12345</li>
              </ul>
              <button onClick={() => setShowOffline(false)}>关闭</button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}