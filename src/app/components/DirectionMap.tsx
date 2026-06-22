"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./DirectionMap.module.css";

type Coord = { lat: number; lon: number };
type LayerKey = "map" | "satellite";
type StatusType = "info" | "error" | "success" | "loading";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface Suggestion {
  label: string;
  coord: Coord;
}

export default function DirectionMap() {
  const mapElRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof LeafletNS | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const layersRef = useRef<Record<LayerKey, LeafletNS.TileLayer> | null>(null);
  const routeLayerRef = useRef<LeafletNS.Polyline | null>(null);
  const markerARef = useRef<LeafletNS.Marker | null>(null);
  const markerBRef = useRef<LeafletNS.Marker | null>(null);

  // Resolved coordinates (set when the user picks a suggestion).
  const coordsRef = useRef<{ origin: Coord | null; dest: Coord | null }>({
    origin: null,
    dest: null,
  });
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [origin, setOrigin] = useState("Lismore NSW Australia");
  const [dest, setDest] = useState("Brisbane QLD Australia");
  const [originSug, setOriginSug] = useState<Suggestion[]>([]);
  const [destSug, setDestSug] = useState<Suggestion[]>([]);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("map");
  const [toggleOn, setToggleOn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ msg: string; type: StatusType }>({
    msg: "Enter two locations and press Get Directions.",
    type: "info",
  });
  const [dist, setDist] = useState("—");
  const [dur, setDur] = useState("—");

  // ─── Map setup (Leaflet is client-only) ─────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapElRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(mapElRef.current);
      const layers: Record<LayerKey, LeafletNS.TileLayer> = {
        map: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }),
        satellite: L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { attribution: "© Esri", maxZoom: 19 }
        ),
      };
      layers.map.addTo(map);
      map.setView([-28.0, 153.2], 7);

      mapRef.current = map;
      layersRef.current = layers;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const switchLayer = useCallback((type: LayerKey) => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    (Object.values(layers) as LeafletNS.TileLayer[]).forEach((l) =>
      map.removeLayer(l)
    );
    layers[type].addTo(map);
    setActiveLayer(type);
  }, []);

  const makeIcon = useCallback((label: string): LeafletNS.DivIcon => {
    const L = LRef.current!;
    return L.divIcon({
      className: "",
      html: `<div style="background:#e53935;color:white;width:32px;height:32px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);border:2px solid white;">
        <span style="transform:rotate(45deg);font-weight:700;font-size:13px">${label}</span>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });
  }, []);

  // ─── Geocoding via Nominatim ────────────────────────────────
  const fetchSuggestions = useCallback(
    async (query: string, which: "origin" | "dest") => {
      const setSug = which === "origin" ? setOriginSug : setDestSug;
      if (query.length < 3) {
        setSug([]);
        return;
      }
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            query
          )}&format=json&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data: NominatimResult[] = await res.json();
        setSug(
          data.map((r) => ({
            label: r.display_name,
            coord: { lat: parseFloat(r.lat), lon: parseFloat(r.lon) },
          }))
        );
      } catch {
        setSug([]);
      }
    },
    []
  );

  const onInput = useCallback(
    (value: string, which: "origin" | "dest") => {
      if (which === "origin") setOrigin(value);
      else setDest(value);
      coordsRef.current[which] = null; // reset when user types

      clearTimeout(debounceRef.current[which]);
      debounceRef.current[which] = setTimeout(
        () => fetchSuggestions(value.trim(), which),
        350
      );
    },
    [fetchSuggestions]
  );

  const pickSuggestion = useCallback(
    (s: Suggestion, which: "origin" | "dest") => {
      if (which === "origin") {
        setOrigin(s.label);
        setOriginSug([]);
      } else {
        setDest(s.label);
        setDestSug([]);
      }
      coordsRef.current[which] = s.coord;
    },
    []
  );

  // Geocode a free-text value if the user didn't pick from the dropdown.
  const resolveCoord = useCallback(
    async (which: "origin" | "dest"): Promise<Coord> => {
      const cached = coordsRef.current[which];
      if (cached) return cached;
      const q = (which === "origin" ? origin : dest).trim();
      if (!q)
        throw new Error(
          "Please enter a location for point " + (which === "origin" ? "A" : "B")
        );
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q
        )}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data: NominatimResult[] = await res.json();
      if (!data.length) throw new Error(`Could not find "${q}"`);
      const coord = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      coordsRef.current[which] = coord;
      return coord;
    },
    [origin, dest]
  );

  // ─── Routing via OSRM ───────────────────────────────────────
  const getRoute = useCallback(async () => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    setLoading(true);
    setStatus({ msg: "Locating places…", type: "loading" });

    try {
      const from = await resolveCoord("origin");
      const to = await resolveCoord("dest");

      setStatus({ msg: "Calculating road route…", type: "loading" });

      const osrm = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(osrm);
      const data = await res.json();

      if (!data.routes || !data.routes.length)
        throw new Error("No road route found between these points.");

      const route = data.routes[0];
      const latlngs: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );

      if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
      if (markerARef.current) map.removeLayer(markerARef.current);
      if (markerBRef.current) map.removeLayer(markerBRef.current);

      routeLayerRef.current = L.polyline(latlngs, {
        color: "#1a73e8",
        weight: 5,
        opacity: 0.9,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);

      markerARef.current = L.marker([from.lat, from.lon], {
        icon: makeIcon("A"),
      })
        .addTo(map)
        .bindPopup(origin);
      markerBRef.current = L.marker([to.lat, to.lon], { icon: makeIcon("B") })
        .addTo(map)
        .bindPopup(dest);

      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });

      const km = (route.distance / 1000).toFixed(3);
      const secs = Math.round(route.duration);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setDist(`${km} KM`);
      setDur(`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);

      setStatus({
        msg: "✅ Road route loaded via OpenStreetMap + OSRM",
        type: "success",
      });
    } catch (err) {
      setStatus({ msg: "⚠ " + (err as Error).message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [resolveCoord, makeIcon, origin, dest]);

  const statusClass =
    status.type === "error"
      ? styles.statusError
      : status.type === "success"
      ? styles.statusSuccess
      : "";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.headerLabel}>Direction Map</span>
          <button
            type="button"
            aria-label="Toggle"
            className={`${styles.toggle} ${toggleOn ? "" : styles.toggleOff}`}
            onClick={() => setToggleOn((v) => !v)}
          />
        </div>

        <div className={styles.inputs}>
          <div className={styles.inputRow}>
            <div className={styles.pin}>A</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type="text"
                value={origin}
                placeholder="From — type a place..."
                autoComplete="off"
                onChange={(e) => onInput(e.target.value, "origin")}
                onBlur={() => setTimeout(() => setOriginSug([]), 200)}
              />
              {originSug.length > 0 && (
                <div className={styles.suggestions}>
                  {originSug.map((s, i) => (
                    <div
                      key={i}
                      className={styles.suggestionItem}
                      onMouseDown={() => pickSuggestion(s, "origin")}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.inputRow}>
            <div className={styles.pin}>B</div>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type="text"
                value={dest}
                placeholder="To — type a place..."
                autoComplete="off"
                onChange={(e) => onInput(e.target.value, "dest")}
                onBlur={() => setTimeout(() => setDestSug([]), 200)}
              />
              {destSug.length > 0 && (
                <div className={styles.suggestions}>
                  {destSug.map((s, i) => (
                    <div
                      key={i}
                      className={styles.suggestionItem}
                      onMouseDown={() => pickSuggestion(s, "dest")}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            className={styles.routeBtn}
            onClick={getRoute}
            disabled={loading}
          >
            Get Directions
          </button>
        </div>

        <div className={styles.mapTabs}>
          <div
            className={`${styles.tab} ${
              activeLayer === "map" ? styles.tabActive : ""
            }`}
            onClick={() => switchLayer("map")}
          >
            Map
          </div>
          <div
            className={`${styles.tab} ${
              activeLayer === "satellite" ? styles.tabActive : ""
            }`}
            onClick={() => switchLayer("satellite")}
          >
            Satellite
          </div>
        </div>

        <div ref={mapElRef} className={styles.map} />

        <div className={`${styles.statusBar} ${statusClass}`}>
          {status.type === "loading" && <div className={styles.spinner} />}
          <span>{status.msg}</span>
        </div>

        <div className={styles.stats}>
          <div className={styles.statBox}>
            <div className={styles.statIcon}>⇌</div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Distance Apx.</span>
              <span className={styles.statValue}>{dist}</span>
            </div>
          </div>
          <div className={styles.statBox}>
            <div className={styles.statIcon}>⏱</div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Duration Apx.</span>
              <span className={styles.statValue}>{dur}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
