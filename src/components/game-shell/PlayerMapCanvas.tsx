import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  HexData,
  SystemData,
  MapFleet,
  CLASSIFICATION_COLORS,
  hexKey,
} from "@/lib/mapTypes";
import { hexToPixel, pixelToHex, hexCorners } from "@/lib/hexUtils";

interface Props {
  hexes: Map<string, HexData>;
  systems: Map<number, SystemData>;
  /** Systems currently in sensor view (rendered bright). */
  visibleSystemIds: number[];
  /** Systems the player has ever observed (rendered faded if not in visibleSystemIds). */
  everSeenSystemIds?: number[];
  fleets?: MapFleet[];
  onSystemClick?: (system: SystemData) => void;
  onFleetClick?: (fleet: MapFleet) => void;
  /** When set, the next click is captured for targeting instead of selection. */
  targetingMode?: "hex" | "fleet" | null;
  onHexTargetPicked?: (hex: { x: number; y: number }) => void;
  onFleetTargetPicked?: (fleet: MapFleet) => void;
  /** In "fleet" targeting mode, called when the user clicks a system hex with no fleet on it. */
  onSystemTargetPicked?: (system: SystemData) => void;
  onCancelTargeting?: () => void;
  /** Hex keys (e.g. "3,-2") currently in live sensor view (bright). */
  debugVisibleHexKeys?: Set<string>;
  /** Hex keys ever observed (faded if not in debugVisibleHexKeys). */
  everSeenHexKeys?: Set<string>;
  /** Optional arrow drawn from a fleet to its order target (move dest or attack target). */
  orderArrow?: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    kind: "move" | "attack";
  } | null;
  /** The viewing player's owner classification (e.g. "PROVINCE_3"). Own fleets are always shown. */
  ownClassification?: string;
  className?: string;
}

const HEX_SIZE = 10;

/** Faction/owner colors for province tinting */
const OWNER_COLORS: Record<string, string> = {
  PROVINCE_1: "#f97316",
  PROVINCE_2: "#06b6d4",
  PROVINCE_3: "#eab308",
  PROVINCE_4: "#a855f7",
  PROVINCE_5: "#f472b6",
  PROVINCE_6: "#14b8a6",
};

const PlayerMapCanvas: React.FC<Props> = ({
  hexes,
  systems,
  visibleSystemIds,
  everSeenSystemIds,
  fleets = [],
  onSystemClick,
  onFleetClick,
  targetingMode = null,
  onHexTargetPicked,
  onFleetTargetPicked,
  onSystemTargetPicked,
  onCancelTargeting,
  debugVisibleHexKeys,
  everSeenHexKeys,
  orderArrow = null,
  ownClassification,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [hoveredSystem, setHoveredSystem] = useState<SystemData | null>(null);
  const [hoveredFleet, setHoveredFleet] = useState<MapFleet | null>(null);
  const [cursorStyle, setCursorStyle] = useState("grab");
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const animRef = useRef<number>(0);

  const visibleSet = React.useMemo(() => new Set(visibleSystemIds), [visibleSystemIds]);
  const everSeenSet = React.useMemo(
    () => new Set(everSeenSystemIds && everSeenSystemIds.length > 0 ? everSeenSystemIds : visibleSystemIds),
    [everSeenSystemIds, visibleSystemIds]
  );

  // Hex keys currently in live sensor view. Prefer the prop computed by the
  // page (which does the proper sensor-radius scan); fall back to static
  // CORE/PROVINCE classification when not provided.
  const visibleHexKeys = React.useMemo(() => {
    if (debugVisibleHexKeys && debugVisibleHexKeys.size > 0) return debugVisibleHexKeys;
    const set = new Set<string>();
    for (const [key, hex] of hexes) {
      const cls = hex.classification;
      if (cls === "CORE" || cls === "MARCHES" || cls.startsWith("PROVINCE_")) {
        set.add(key);
      }
    }
    return set;
  }, [hexes, debugVisibleHexKeys]);

  // Fleets visible on the map:
  //  - The player's own fleets are ALWAYS visible (regardless of sensor view).
  //  - Other fleets are visible only when they sit in a hex inside live sensor view.
  const visibleFleets = React.useMemo(() => {
    return fleets.filter(f => {
      if (ownClassification && f.owner_classification === ownClassification) return true;
      return visibleHexKeys.has(hexKey(f.hex_x, f.hex_y));
    });
  }, [fleets, visibleHexKeys, ownClassification]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x: camX, y: camY, zoom } = cameraRef.current;
    const w = canvas.width;
    const h = canvas.height;
    const size = HEX_SIZE * zoom;

    // Background — dark space
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + camX, h / 2 + camY);

    const margin = size * 3;
    const left = -(w / 2 + camX) - margin;
    const right = (w / 2 - camX) + margin;
    const top = -(h / 2 + camY) - margin;
    const bottom = (h / 2 - camY) + margin;

    // Draw hexes
    // A hex is rendered if it's "ever seen" (live now or remembered).
    // Live hexes get full brightness; remembered-only hexes are faded.
    const liveHexSet = debugVisibleHexKeys;
    const memoryHexSet = everSeenHexKeys;
    const hasLive = !!liveHexSet && liveHexSet.size > 0;
    const hasMemory = !!memoryHexSet && memoryHexSet.size > 0;

    for (const hex of hexes.values()) {
      const [px, py] = hexToPixel(hex.x, hex.y, size);
      if (px < left || px > right || py < top || py > bottom) continue;

      const hk = hexKey(hex.x, hex.y);
      const isLive = hasLive ? liveHexSet!.has(hk) : true;
      const isRemembered = hasMemory ? memoryHexSet!.has(hk) : isLive;

      const corners = hexCorners(px, py, size);

      // Determine fill based on classification
      const isCore = hex.classification === "CORE";
      const isMarches = hex.classification === "MARCHES";
      const isUnexplored = hex.classification === "UNEXPLORED_MARCHES";

      let fillColor: string;
      let alpha: number;

      // Province borders are part of the public political map — every player
      // knows which faction owns which province from turn 1. So all province
      // hexes always show their muted faction tint, regardless of sensor
      // coverage. Sensor coverage only governs whether you see what's happening
      // *inside* those hexes (systems, fleets), not the political color.
      const isProvinceHex = hex.classification.startsWith("PROVINCE_");

      if (isUnexplored) {
        fillColor = "#111118";
        alpha = 0.6;
      } else if (isMarches) {
        // Marches: bright fill only when in live sensor range; otherwise fog.
        if (isLive) {
          fillColor = "#1a1a24";
          alpha = 0.8;
        } else {
          fillColor = "#111118";
          alpha = 0.6;
        }
      } else if (isCore) {
        fillColor = "#2a2a3a";
        alpha = 1;
      } else if (isProvinceHex) {
        // Province — use a muted version of the province color
        const baseColor = CLASSIFICATION_COLORS[hex.classification] || "#444";
        fillColor = baseColor;
        alpha = 0.25;
      } else {
        fillColor = "#111118";
        alpha = 0.6;
      }

      // Visibility tinting:
      //   live      → bright
      //   remembered (not live) → faded ghost
      //   never seen → very dim fog
      // Exception: province hexes owned by OTHER players keep their muted
      // political tint regardless of sensor coverage. Otherwise an enemy
      // planet you survey would light up that hex with the enemy's faction
      // color as if YOU controlled it.
      const isForeignProvinceHex =
        isProvinceHex && (!ownClassification || hex.classification !== ownClassification);

      if (hasLive || hasMemory) {
        if (isForeignProvinceHex) {
          // Hold the muted province tint — no survey-brightening boost.
        } else if (isLive) {
          alpha = Math.min(1, alpha * 2.4 + 0.15);
        } else if (isRemembered) {
          // Explored-but-not-currently-in-sensor: noticeably brighter than fog
          // so the player can tell they've scouted this space.
          alpha = Math.min(1, alpha * 1.1 + 0.15);
        } else {
          alpha = alpha * 0.2;
        }
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Border — brightest for live, medium for explored memory, faintest for
      // never-seen fog (which still gets a thin outline so the player can click
      // to issue move orders).
      ctx.globalAlpha = 1;
      if (isLive) {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 0.75;
      } else if (isRemembered) {
        ctx.strokeStyle = "rgba(255,255,255,0.20)";
        ctx.lineWidth = 0.6;
      } else {
        ctx.strokeStyle = "rgba(200,169,110,0.18)";
        ctx.lineWidth = 0.5;
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    // Build hexId -> hex lookup
    const hexIdMap = new Map<number, HexData>();
    for (const h of hexes.values()) {
      if (h.has_system) hexIdMap.set(h.hex_id, h);
    }

    // Draw systems the player has ever observed (live = bright, memory = faded).
    for (const [, sys] of systems) {
      if (!everSeenSet.has(sys.system_id)) continue;
      const sysHex = hexIdMap.get(sys.hex_id);
      if (!sysHex) continue;

      const [px, py] = hexToPixel(sysHex.x, sysHex.y, size);
      if (px < left || px > right || py < top || py > bottom) continue;

      const isLiveSystem = visibleSet.has(sys.system_id);
      ctx.globalAlpha = isLiveSystem ? 1 : 0.45;

      // System dot
      const isStation = sys.system_type === "station";
      const dotSize = isStation ? size * 0.25 : size * 0.35;

      // Glow (suppressed for memory-only systems to read as "ghost")
      const ownerColor = OWNER_COLORS[sys.owner] || "#c8a96e";
      if (isLiveSystem) {
        ctx.shadowColor = ownerColor;
        ctx.shadowBlur = size * 0.4;
      } else {
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }

      ctx.fillStyle = ownerColor;
      ctx.beginPath();
      if (isStation) {
        ctx.moveTo(px, py - dotSize);
        ctx.lineTo(px + dotSize, py);
        ctx.lineTo(px, py + dotSize);
        ctx.lineTo(px - dotSize, py);
      } else {
        ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Border ring
      ctx.strokeStyle = isLiveSystem ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      if (!isStation) {
        ctx.beginPath();
        ctx.arc(px, py, dotSize + 1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // System name when zoomed in enough
      if (zoom > 2.5) {
        ctx.fillStyle = isLiveSystem ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)";
        ctx.font = `${Math.max(6, size * 0.22)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(sys.system_name, px, py + dotSize + size * 0.35);
      }

      ctx.globalAlpha = 1;
    }

    // Draw visible fleets as triangular markers
    for (const fleet of visibleFleets) {
      const [fx, fy] = hexToPixel(fleet.hex_x, fleet.hex_y, size);
      if (fx < left || fx > right || fy < top || fy > bottom) continue;

      const triSize = size * 0.35;
      const fleetColor = OWNER_COLORS[fleet.owner_classification] || "#c8a96e";

      // Glow
      ctx.shadowColor = fleetColor;
      ctx.shadowBlur = size * 0.3;

      ctx.fillStyle = fleetColor;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy - triSize);
      ctx.lineTo(fx + triSize * 0.8, fy + triSize * 0.5);
      ctx.lineTo(fx - triSize * 0.8, fy + triSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Fleet name when zoomed in
      if (zoom > 2.5) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `${Math.max(6, size * 0.2)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(fleet.fleet_name, fx, fy + triSize + size * 0.35);
      }
    }

    // Order arrow (move/attack target for the currently selected fleet)
    if (orderArrow) {
      const [ax, ay] = hexToPixel(orderArrow.fromX, orderArrow.fromY, size);
      const [bx, by] = hexToPixel(orderArrow.toX, orderArrow.toY, size);
      const isAttack = orderArrow.kind === "attack";
      // Crimson for attack, bronze-gold for move
      const arrowColor = isAttack ? "#dc2626" : "#c8a96e";

      ctx.save();
      ctx.shadowColor = arrowColor;
      ctx.shadowBlur = size * 0.35;
      ctx.strokeStyle = arrowColor;
      ctx.fillStyle = arrowColor;
      ctx.lineWidth = Math.max(1.25, size * 0.12);
      ctx.lineCap = "round";

      if (isAttack) {
        // Dashed line for attack
        ctx.setLineDash([size * 0.45, size * 0.3]);
      }

      // Shorten line so it ends just before the target marker
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const pad = size * 0.5; // pull endpoint back from the target hex center
      const ex = bx - ux * pad;
      const ey = by - uy * pad;
      // Pull start point away from origin marker too
      const sx = ax + ux * pad * 0.8;
      const sy = ay + uy * pad * 0.8;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Arrowhead
      ctx.setLineDash([]);
      const headLen = size * 0.7;
      const headW = size * 0.4;
      const leftX = ex - ux * headLen + uy * headW;
      const leftY = ey - uy * headLen - ux * headW;
      const rightX = ex - ux * headLen - uy * headW;
      const rightY = ey - uy * headLen + ux * headW;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.restore();
    }

    // Center crosshair
    const [cx, cy] = hexToPixel(0, 0, size);
    ctx.strokeStyle = "rgba(200,169,110,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx + size, cy);
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy + size);
    ctx.stroke();

    ctx.restore();
  }, [hexes, systems, visibleSet, everSeenSet, visibleFleets, debugVisibleHexKeys, everSeenHexKeys, orderArrow, ownClassification]);

  useEffect(() => {
    const loop = () => {
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Build hex_id -> system lookup for click detection
  const hexIdToSystem = React.useMemo(() => {
    const map = new Map<number, SystemData>();
    for (const [, sys] of systems) {
      if (visibleSet.has(sys.system_id)) map.set(sys.hex_id, sys);
    }
    return map;
  }, [systems, visibleSet]);

  // Build hex_key -> fleet lookup for click/hover detection
  const hexKeyToFleet = React.useMemo(() => {
    const map = new Map<string, MapFleet>();
    for (const f of visibleFleets) {
      map.set(hexKey(f.hex_x, f.hex_y), f);
    }
    return map;
  }, [visibleFleets]);

  const getHexCoordsAtMouse = useCallback(
    (e: React.MouseEvent): [number, number] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const size = HEX_SIZE * camera.zoom;
      const worldX = mx - canvas.width / 2 - camera.x;
      const worldY = my - canvas.height / 2 - camera.y;
      return pixelToHex(worldX, worldY, size);
    },
    [camera]
  );

  const DRAG_THRESHOLD = 5;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
      }
    },
    [camera]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Start dragging if mouse moved enough from mousedown position
      if (mouseDownPos && !isDragging) {
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          setIsDragging(true);
          setCursorStyle("grabbing");
        }
      }

      if (isDragging) {
        setCamera((c) => ({
          ...c,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        }));
        return;
      }

      // Hover detection
      const coords = getHexCoordsAtMouse(e);
      if (!coords) {
        setHoveredSystem(null);
        setHoveredFleet(null);
        setCursorStyle("grab");
        return;
      }
      const hk = hexKey(coords[0], coords[1]);
      const hex = hexes.get(hk);

      const fleet = hexKeyToFleet.get(hk);
      const sys = hex && hex.has_system ? hexIdToSystem.get(hex.hex_id) ?? null : null;

      setHoveredFleet(fleet || null);
      setHoveredSystem(sys);

      if (fleet || sys) {
        setCursorStyle("pointer");
      } else {
        setCursorStyle("grab");
      }
    },
    [isDragging, mouseDownPos, dragStart, getHexCoordsAtMouse, hexes, hexIdToSystem, hexKeyToFleet]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const wasDragging = isDragging;
      setIsDragging(false);
      setMouseDownPos(null);
      setCursorStyle("grab");

      if (!wasDragging && e.button === 0) {
        const coords = getHexCoordsAtMouse(e);
        if (!coords) return;
        const hk = hexKey(coords[0], coords[1]);
        const hex = hexes.get(hk);

        // Targeting mode: capture click as hex or enemy fleet target
        if (targetingMode === "hex") {
          if (hex) onHexTargetPicked?.({ x: coords[0], y: coords[1] });
          return;
        }
        if (targetingMode === "fleet") {
          const fleet = hexKeyToFleet.get(hk);
          if (fleet) { onFleetTargetPicked?.(fleet); return; }
          // No fleet at the clicked hex — fall back to picking a planet/system as target.
          if (hex && hex.has_system) {
            const sys = hexIdToSystem.get(hex.hex_id);
            if (sys) { onSystemTargetPicked?.(sys); return; }
          }
          return;
        }

        // Check fleet first
        const fleet = hexKeyToFleet.get(hk);
        if (fleet && onFleetClick) {
          onFleetClick(fleet);
          return;
        }

        // Then system
        if (hex && hex.has_system) {
          const sys = hexIdToSystem.get(hex.hex_id);
          if (sys && onSystemClick) onSystemClick(sys);
        }
      }
    },
    [isDragging, getHexCoordsAtMouse, hexes, hexIdToSystem, hexKeyToFleet, onSystemClick, onFleetClick, targetingMode, onHexTargetPicked, onFleetTargetPicked, onSystemTargetPicked]
  );

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setMouseDownPos(null);
    setCursorStyle("grab");
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera((c) => ({
      ...c,
      zoom: Math.max(0.2, Math.min(20, c.zoom * delta)),
    }));
  }, []);

  const centerMap = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }, []);

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ cursor: cursorStyle }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Controls */}
      <div className="absolute bottom-2 left-2 flex gap-2">
        <button
          onClick={centerMap}
          className="rounded bg-background/80 border border-bronze/20 px-2 py-1 text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
        >
          Center
        </button>
        <span className="rounded bg-background/80 border border-bronze/20 px-2 py-1 text-[10px] font-heading text-muted-foreground">
          {camera.zoom.toFixed(1)}×
        </span>
      </div>

      {/* Hovered system tooltip */}
      {hoveredSystem && !hoveredFleet && (
        <div className="absolute top-3 left-3 rounded-lg bg-background/90 border border-bronze/30 px-3 py-2 text-xs space-y-0.5 pointer-events-none">
          <div className="font-heading font-semibold text-foreground">{hoveredSystem.system_name}</div>
          <div className="text-muted-foreground">
            Pop: {hoveredSystem.current_population > 0 ? hoveredSystem.current_population.toLocaleString() : "Uninhabited"} · Condition: {hoveredSystem.condition}
          </div>
          <div className="text-muted-foreground">
            Owner: {hoveredSystem.owner} · Resources: {hoveredSystem.resources}
          </div>
        </div>
      )}

      {/* Hovered fleet tooltip */}
      {hoveredFleet && (
        <div className="absolute top-3 left-3 rounded-lg bg-background/90 border border-bronze/30 px-3 py-2 text-xs space-y-0.5 pointer-events-none">
          <div className="font-heading font-semibold text-foreground">⚔ {hoveredFleet.fleet_name}</div>
          <div className="text-muted-foreground">
            Owner: {hoveredFleet.owner_classification} · Hex: ({hoveredFleet.hex_x}, {hoveredFleet.hex_y})
          </div>
        </div>
      )}

      {/* Mode label */}
      <div className="absolute top-3 right-3 pointer-events-none">
        <span className="font-heading text-[9px] uppercase tracking-[0.2em] text-bronze/40">
          Strategic Map · {visibleSystemIds.length} systems visible
        </span>
      </div>

      {/* Targeting banner */}
      {targetingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-sm bg-crimson text-primary-foreground px-3 py-1.5 border border-bronze/40 shadow-md">
          <span className="font-heading text-[10px] uppercase tracking-wider font-bold">
            {targetingMode === "hex"
              ? "Click a hex to set destination"
              : "Click an enemy fleet to target"}
          </span>
          <button
            onClick={onCancelTargeting}
            className="ml-1 px-1.5 py-0.5 rounded-sm border border-primary-foreground/40 text-[9px] font-heading uppercase tracking-wider hover:bg-primary-foreground/10"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayerMapCanvas;
