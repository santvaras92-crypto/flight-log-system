"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GpsPoint {
  lat: number;
  lng: number;
  alt?: number;
  spd?: number;
  elapsed?: number;
}

interface FlightMapProps {
  points: GpsPoint[];
  className?: string;
}

export default function FlightMap({ points, className }: FlightMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Filter valid points and deduplicate
  const validPoints = points.filter(
    (p) => p.lat !== 0 && p.lng !== 0 && p.lat >= -60 && p.lat <= 0 && p.lng >= -80 && p.lng <= -55
  );

  // Fix ground speed at flight start: the delta-compression accumulator
  // converges ground speed to a non-zero value even when the aircraft is parked.
  // At the start, if position doesn't change between consecutive points,
  // the real ground speed is 0 — override the false converged value.
  for (let i = 0; i < validPoints.length; i++) {
    if (i === 0) {
      // First point — if followed by same position, it's ground
      if (validPoints.length > 1 &&
          Math.abs(validPoints[0].lat - validPoints[1].lat) < 0.0001 &&
          Math.abs(validPoints[0].lng - validPoints[1].lng) < 0.0001) {
        validPoints[0] = { ...validPoints[0], spd: 0 };
      }
      continue;
    }
    const prev = validPoints[i - 1];
    const curr = validPoints[i];
    // If position unchanged → parked, ground speed = 0
    if (Math.abs(curr.lat - prev.lat) < 0.0001 && Math.abs(curr.lng - prev.lng) < 0.0001) {
      validPoints[i] = { ...validPoints[i], spd: 0 };
    } else {
      // Position started changing → aircraft moving, stop overriding
      break;
    }
  }

  // Remove consecutive duplicates (GPS updates every few seconds)
  const dedupedPoints: GpsPoint[] = [];
  for (const p of validPoints) {
    const last = dedupedPoints[dedupedPoints.length - 1];
    if (!last || Math.abs(p.lat - last.lat) > 0.00001 || Math.abs(p.lng - last.lng) > 0.00001) {
      dedupedPoints.push(p);
    }
  }

  // Filter GPS initialization artifacts — the GPS accumulator may "stabilize"
  // at a wrong intermediate position before jumping to the real one.
  // Strategy: find the first big jump (>3km between consecutive points) in the
  // opening segment (first 60 points). Everything before that jump is init artifact.
  // Then filter mid-flight outliers using implied speed (distance/time).
  let startIdx = 0;
  const MAX_INIT_WINDOW = 60; // only look for init artifacts in first 60 points
  for (let i = 1; i < Math.min(dedupedPoints.length, MAX_INIT_WINDOW); i++) {
    const prev = dedupedPoints[i - 1];
    const curr = dedupedPoints[i];
    const dLat = (curr.lat - prev.lat) * 111320;
    const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist > 3000) {
      // Everything before index i is init artifact — start from i
      startIdx = i;
    }
  }

  // Filter mid-flight outlier points using implied speed.
  // Cessna 172 max ground speed ≈ 150 kts ≈ 77 m/s. Use 100 m/s as generous limit.
  // When consecutive GPS points have a gap in time, use speed = distance/time_gap.
  // When no elapsed time info, fall back to 3km flat distance filter.
  const MAX_SPEED_MS = 100; // ~194 knots, generous for C172 with tailwind
  const trimmed = dedupedPoints.slice(startIdx);
  const cleanPoints: GpsPoint[] = trimmed.length > 0 ? [trimmed[0]] : [];
  for (let i = 1; i < trimmed.length; i++) {
    const prev = cleanPoints[cleanPoints.length - 1];
    const curr = trimmed[i];
    const dLat = (curr.lat - prev.lat) * 111320;
    const dLng = (curr.lng - prev.lng) * 111320 * Math.cos(prev.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);

    // Use time-based speed check if elapsed data available
    if (prev.elapsed != null && curr.elapsed != null) {
      const timeDiff = curr.elapsed - prev.elapsed;
      if (timeDiff > 0) {
        const speed = dist / timeDiff; // m/s
        if (speed <= MAX_SPEED_MS) {
          cleanPoints.push(curr);
        }
        continue;
      }
    }
    // Fallback: flat distance filter
    if (dist < 3000) {
      cleanPoints.push(curr);
    }
  }

  useEffect(() => {
    if (!mapRef.current || cleanPoints.length < 2) return;

    // Destroy previous map if exists
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
      attributionControl: false,
    });
    mapInstance.current = map;

    // OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    // Build polyline
    const latLngs: L.LatLng[] = cleanPoints.map((p) => L.latLng(p.lat, p.lng));

    // Color gradient based on altitude
    const maxAlt = Math.max(...cleanPoints.map((p) => p.alt || 0));
    const minAlt = Math.min(...cleanPoints.filter(p => (p.alt || 0) > 0).map((p) => p.alt || 0));

    // Draw segments with altitude coloring
    if (maxAlt > minAlt && cleanPoints.some(p => p.alt && p.alt > 0)) {
      for (let i = 0; i < latLngs.length - 1; i++) {
        const alt = cleanPoints[i].alt || minAlt;
        const ratio = Math.min(1, Math.max(0, (alt - minAlt) / (maxAlt - minAlt)));
        // Blue (low) → Red (high)
        const r = Math.round(ratio * 220);
        const g = Math.round(50 + (1 - Math.abs(ratio - 0.5) * 2) * 100);
        const b = Math.round((1 - ratio) * 220);
        const color = `rgb(${r},${g},${b})`;

        L.polyline([latLngs[i], latLngs[i + 1]], {
          color,
          weight: 3,
          opacity: 0.85,
        }).addTo(map);
      }
    } else {
      // Simple blue line if no altitude data
      L.polyline(latLngs, {
        color: "#2563eb",
        weight: 3,
        opacity: 0.85,
      }).addTo(map);
    }

    // Start marker (green)
    const startIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: "",
    });

    // End marker (red)
    const endIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:#ef4444;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: "",
    });

    L.marker(latLngs[0], { icon: startIcon })
      .addTo(map)
      .bindPopup("🟢 Inicio");

    L.marker(latLngs[latLngs.length - 1], { icon: endIcon })
      .addTo(map)
      .bindPopup("🔴 Fin");

    // Fit bounds with padding
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [30, 30] });

    // Attribution
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a>')
      .addTo(map);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [cleanPoints.length, expanded]);

  // Resize map when expanding
  useEffect(() => {
    if (mapInstance.current) {
      setTimeout(() => mapInstance.current?.invalidateSize(), 100);
    }
  }, [expanded]);

  if (cleanPoints.length < 2) {
    return (
      <div className={`bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 text-sm ${className || ""}`} style={{ height: 200 }}>
        <span>📍 Sin datos GPS para este vuelo</span>
      </div>
    );
  }

  // GPS stats
  const maxSpd = Math.max(...cleanPoints.filter(p => p.spd).map(p => p.spd || 0));
  const gpsMaxAlt = Math.max(...cleanPoints.filter(p => p.alt && p.alt > 0).map(p => p.alt || 0));

  return (
    <div className={`relative ${className || ""}`}>
      {/* GPS Stats Bar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-t-xl">
        <span className="font-semibold text-slate-300">📍 GPS Track</span>
        <span>{cleanPoints.length} pts</span>
        {gpsMaxAlt > 0 && <span>⬆ {Math.round(gpsMaxAlt * 3.281)} ft</span>}
        {maxSpd > 0 && <span>🏃 {Math.round(maxSpd)} kts</span>}
        <div className="flex-1" />
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-300 hover:text-white transition"
          title={expanded ? "Minimizar" : "Expandir mapa"}
        >
          {expanded ? "⊖" : "⊕"}
        </button>
      </div>
      {/* Map Container */}
      <div
        ref={mapRef}
        className="rounded-b-xl border border-t-0 border-slate-200"
        style={{ height: expanded ? 600 : 350, transition: "height 0.3s ease" }}
      />
      {/* Altitude legend */}
      {gpsMaxAlt > 0 && (
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px] text-slate-600 flex items-center gap-1.5 shadow-sm z-[1000]">
          <span>Bajo</span>
          <div className="w-16 h-2 rounded" style={{ background: "linear-gradient(to right, rgb(0,50,220), rgb(110,150,50), rgb(220,50,0))" }} />
          <span>Alto</span>
        </div>
      )}
    </div>
  );
}
