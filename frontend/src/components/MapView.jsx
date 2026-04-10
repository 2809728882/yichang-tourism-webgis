import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

function RouteAutoFit({ routePath }) {
  const map = useMap();
  useEffect(() => {
    if (!Array.isArray(routePath) || routePath.length < 2) return;
    const bounds = routePath.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, routePath]);

  return null;
}

function FlyToPoi({ pois, activePoiId }) {
  const map = useMap();
  useEffect(() => {
    if (!activePoiId) return;
    const poi = pois.find((p) => p.id === activePoiId);
    if (!poi) return;
    map.flyTo([poi.location.lat, poi.location.lng], 12, { duration: 0.8 });
  }, [map, pois, activePoiId]);
  return null;
}

function poiIcon(category) {
  const colorMap = { 自然: "#16a34a", 人文: "#7c3aed", 工程: "#2563eb", 文化: "#b45309", 亲子: "#db2777" };
  const color = colorMap[category] || "#0f766e";
  return L.divIcon({
    className: "poi-icon-wrap",
    html: `<div class="poi-icon-dot" style="background:${color}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

export default function MapView({ pois, focusPoiId, heatData, routePath, routeLine, activePoiId }) {
  const center = [30.7, 111.29];
  const routeStopIcon = (order) =>
    L.divIcon({
      className: "route-order-icon-wrap",
      html: `<div class="route-order-icon">${order}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

  return (
    <MapContainer center={center} zoom={10} className="map-container">
      <FlyToPoi pois={pois} activePoiId={activePoiId || focusPoiId} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pois.map((poi) => {
        const isFocus = poi.id === focusPoiId;
        return (
          <Marker key={poi.id} position={[poi.location.lat, poi.location.lng]} icon={poiIcon(poi.category)}>
            <Popup>
              <strong>{poi.name}</strong>
              <div>{poi.description}</div>
              <div>门票余量: {poi.ticketRemain}</div>
              <div>拥挤度: {(poi.crowdLevel * 100).toFixed(0)}%</div>
              {poi.metricSource ? <div>数据来源: {poi.metricSource}</div> : null}
              {poi.metricUpdatedAt ? <div>更新时间: {new Date(poi.metricUpdatedAt).toLocaleString()}</div> : null}
              {poi.metricFormulas?.ticketRemain ? <div>票务口径: {poi.metricFormulas.ticketRemain}</div> : null}
              {poi.metricFormulas?.crowdPercent ? <div>客流口径: {poi.metricFormulas.crowdPercent}</div> : null}
              {isFocus ? <div style={{ color: "#1677ff" }}>AI当前推荐景点</div> : null}
            </Popup>
          </Marker>
        );
      })}
      {(heatData || []).map((h) => {
        const poi = pois.find((p) => p.id === h.id);
        if (!poi) return null;
        return (
          <CircleMarker
            key={`heat-${h.id}`}
            center={[poi.location.lat, poi.location.lng]}
            radius={6 + h.heat / 25}
            pathOptions={{ color: h.heat > 60 ? "#ff4d4f" : "#faad14", fillOpacity: 0.35 }}
          />
        );
      })}
      {Array.isArray(routePath) && routePath.length >= 2 ? (
        <>
          <RouteAutoFit routePath={routePath} />
          <Polyline
            positions={(routeLine?.length ? routeLine : routePath).map((p) => [p.lat, p.lng])}
            pathOptions={{ color: "#1677ff", weight: 5, opacity: 0.85 }}
          />
          {routePath.map((p) => (
            <Marker
              key={`route-stop-${p.order}-${p.lat}-${p.lng}`}
              position={[p.lat, p.lng]}
              icon={routeStopIcon(p.order)}
            >
              <Tooltip permanent direction="top" offset={[0, -10]} opacity={0.95}>
                第{p.order}站
              </Tooltip>
              <Popup>
                <strong>第 {p.order} 站</strong>
                <div>{p.name}</div>
              </Popup>
            </Marker>
          ))}
        </>
      ) : null}
    </MapContainer>
  );
}
