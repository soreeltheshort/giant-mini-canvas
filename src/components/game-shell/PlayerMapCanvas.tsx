import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  HexData,
  SystemData,
  CLASSIFICATION_COLORS,
  hexKey,
} from "@/lib/mapTypes";
import { hexToPixel, pixelToHex, hexCorners } from "@/lib/hexUtils";

interface Props {
  hexes: Map<string, HexData>;
  systems: Map<number, SystemData>;
  visibleSystemIds: number[];
  onSystemClick?: (system: SystemData) => void;
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
  onSystemClick,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [hoveredSystem, setHoveredSystem] = useState<SystemData | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const animRef = useRef<number>(0);

  const visibleSet = React.useMemo(() => new Set(visibleSystemIds), [visibleSystemIds]);

  // Build a set of hex_ids that have visible systems
  const visibleHexIds = React.useMemo(() => {
    const set = new Set<number>();
    for (const [sysId, sys] of systems) {
      if (visibleSet.has(sysId)) set.add(sys.hex_id);
    }
    return set;
  }, [systems, visibleSet]);

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
    for (const hex of hexes.values()) {
      const [px, py] = hexToPixel(hex.x, hex.y, size);
      if (px < left || px > right || py < top || py > bottom) continue;

      const corners = hexCorners(px, py, size);

      // Determine fill based on classification
      const isProvince = hex.classification.startsWith("PROVINCE_");
      const isCore = hex.classification === "CORE";
      const isMarches = hex.classification === "MARCHES";
      const isUnexplored = hex.classification === "UNEXPLORED_MARCHES";

      let fillColor: string;
      let alpha: number;

      if (isUnexplored) {
        fillColor = "#111118";
        alpha = 0.6;
      } else if (isMarches) {
        fillColor = "#1a1a24";
        alpha = 0.8;
      } else if (isCore) {
        fillColor = "#2a2a3a";
        alpha = 1;
      } else {
        // Province — use a muted version of the province color
        const baseColor = CLASSIFICATION_COLORS[hex.classification] || "#444";
        fillColor = baseColor;
        alpha = 0.25;
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    // Build hexId -> hex lookup
    const hexIdMap = new Map<number, HexData>();
    for (const h of hexes.values()) {
      if (h.has_system) hexIdMap.set(h.hex_id, h);
    }

    // Draw visible systems
    for (const [sysId, sys] of systems) {
      if (!visibleSet.has(sysId)) continue;
      const sysHex = hexIdMap.get(sys.hex_id);
      if (!sysHex) continue;

      const [px, py] = hexToPixel(sysHex.x, sysHex.y, size);
      if (px < left || px > right || py < top || py > bottom) continue;

      // System dot
      const isStation = sys.system_type === "station";
      const dotSize = isStation ? size * 0.25 : size * 0.35;

      // Glow
      const ownerColor = OWNER_COLORS[sys.owner] || "#c8a96e";
      ctx.shadowColor = ownerColor;
      ctx.shadowBlur = size * 0.4;

      ctx.fillStyle = ownerColor;
      ctx.beginPath();
      if (isStation) {
        // Diamond shape for stations
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
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      if (!isStation) {
        ctx.beginPath();
        ctx.arc(px, py, dotSize + 1, 0, Math.PI * 2);
        ctx.stroke();
      }

      // System name when zoomed in enough
      if (zoom > 2.5) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `${Math.max(6, size * 0.22)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(sys.system_name, px, py + dotSize + size * 0.35);
      }
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
  }, [hexes, systems, visibleSet]);

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
    for (const [sysId, sys] of systems) {
      if (visibleSet.has(sysId)) map.set(sys.hex_id, sys);
    }
    return map;
  }, [systems, visibleSet]);

  const getHexAtMouse = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const size = HEX_SIZE * camera.zoom;
      const worldX = mx - canvas.width / 2 - camera.x;
      const worldY = my - canvas.height / 2 - camera.y;
      const [hx, hy] = pixelToHex(worldX, worldY, size);
      return hexes.get(hexKey(hx, hy)) || null;
    },
    [camera, hexes]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
        return;
      }
      if (e.button === 0) {
        const hex = getHexAtMouse(e);
        if (hex && hex.has_system) {
          const sys = hexIdToSystem.get(hex.hex_id);
          if (sys && onSystemClick) onSystemClick(sys);
        }
      }
    },
    [camera, getHexAtMouse, hexIdToSystem, onSystemClick]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setCamera((c) => ({
          ...c,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        }));
        return;
      }
      const hex = getHexAtMouse(e);
      if (hex && hex.has_system) {
        const sys = hexIdToSystem.get(hex.hex_id);
        setHoveredSystem(sys || null);
      } else {
        setHoveredSystem(null);
      }
    },
    [isDragging, dragStart, getHexAtMouse, hexIdToSystem]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
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
        className="cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
      {hoveredSystem && (
        <div className="absolute top-3 left-3 rounded-lg bg-background/90 border border-bronze/30 px-3 py-2 text-xs space-y-0.5 pointer-events-none">
          <div className="font-heading font-semibold text-foreground">{hoveredSystem.system_name}</div>
          <div className="text-muted-foreground">
            Pop: {hoveredSystem.current_population.toLocaleString()} · Condition: {hoveredSystem.condition}
          </div>
          <div className="text-muted-foreground">
            Owner: {hoveredSystem.owner} · Resources: {hoveredSystem.resources}
          </div>
        </div>
      )}

      {/* Mode label */}
      <div className="absolute top-3 right-3 pointer-events-none">
        <span className="font-heading text-[9px] uppercase tracking-[0.2em] text-bronze/40">
          Strategic Map · {visibleSystemIds.length} systems visible
        </span>
      </div>
    </div>
  );
};

export default PlayerMapCanvas;
