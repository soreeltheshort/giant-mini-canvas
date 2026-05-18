import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  HexData,
  SystemData,
  MapFleet,
  HexClassification,
  CLASSIFICATION_COLORS,
  EditorState,
  hexKey,
} from "@/lib/mapTypes";
import {
  hexToPixel,
  hexCorners,
  pixelToHex,
  getNeighbors,
  getHexesInRadius,
  brushRadius,
  floodFill,
} from "@/lib/hexUtils";

interface Props {
  hexes: Map<string, HexData>;
  systems: Map<number, SystemData>;
  fleets?: MapFleet[];
  editorState: EditorState;
  onHexClick: (hex: HexData) => void;
  onHexHover: (key: string | null) => void;
  onPaintHex: (hex: HexData) => void;
  onBrushPaint: (hexes: HexData[]) => void;
  onFloodFill: (hex: HexData) => void;
  showPlanetSizes?: boolean;
  ownerColorMap?: Map<string, string>;
  centerOnHex?: { x: number; y: number; nonce: number } | null;
  visibleSystemHexIds?: Set<number> | null;
}

const HEX_SIZE = 10;
const MAP_RANGE = 70;

const HexMapCanvas: React.FC<Props> = ({
  hexes,
  systems,
  fleets = [],
  editorState,
  onHexClick,
  onHexHover,
  onPaintHex,
  onBrushPaint,
  onFloodFill,
  showPlanetSizes = false,
  ownerColorMap,
  centerOnHex,
  visibleSystemHexIds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isPainting, setIsPainting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const animRef = useRef<number>(0);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Resize observer
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

  // Draw loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x: camX, y: camY, zoom } = cameraRef.current;
    const w = canvas.width;
    const h = canvas.height;
    const size = HEX_SIZE * zoom;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + camX, h / 2 + camY);

    // Determine visible bounds in hex coords
    const margin = size * 3;
    const left = -(w / 2 + camX) - margin;
    const right = (w / 2 - camX) + margin;
    const top = -(h / 2 + camY) - margin;
    const bottom = (h / 2 - camY) + margin;

    for (const hex of hexes.values()) {
      const [px, py] = hexToPixel(hex.x, hex.y, size);
      // Viewport culling
      if (px < left || px > right || py < top || py > bottom) continue;

      const corners = hexCorners(px, py, size);
      const color = CLASSIFICATION_COLORS[hex.classification] || "#666";

      // Dim non-highlighted hexes
      let alpha = 1;
      if (editorState.highlightClassification) {
        if (editorState.highlightClassification === "ALL") {
          alpha = hex.classification === "MARCHES" ? 0.3 : 1;
        } else if (hex.classification !== editorState.highlightClassification) {
          alpha = 0.15;
        }
      }

      ctx.globalAlpha = alpha;

      // Fill hex
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      if (editorState.showBorders) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Selected highlight
      if (editorState.selectedHexKey === hexKey(hex.x, hex.y)) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Hover highlight
      if (editorState.hoveredHexKey === hexKey(hex.x, hex.y)) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();
      }

      // Solar system marker
      if (hex.has_system && editorState.showSystems && (!visibleSystemHexIds || visibleSystemHexIds.has(hex.hex_id))) {
        const sys = systems.get(hex.hex_id);
        const ownerKey = sys?.owner ? sys.owner.toLowerCase() : "";
        const ownerColor = ownerKey && ownerColorMap ? ownerColorMap.get(ownerKey) : undefined;
        const planetFill = ownerColor || "#3b82f6";
        // Planet size visualization (Map Testing > Planets tab only)
        if (showPlanetSizes && sys) {
          const hexWidth = Math.sqrt(3) * size; // pointy-top hex width
          const cond = Math.max(0, Math.min(100, sys.condition || 0));
          const pop = Math.max(0, Math.min(100, sys.current_population || 0));
          const ratio = Math.min(1, (cond + pop) / 200);
          const planetRadius = ratio * 0.75 * hexWidth; // diameter up to 1.5×hexWidth
          if (planetRadius > 0.5) {
            ctx.fillStyle = planetFill;
            ctx.beginPath();
            ctx.arc(px, py, planetRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = ownerColor || "#000000";
          ctx.beginPath();
          ctx.arc(px, py, size * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // System name when zoomed in
        if (zoom > 3 && sys) {
          ctx.fillStyle = "#ffffff";
          ctx.font = `${Math.max(6, size * 0.25)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(sys.system_name, px, py + size * 0.6);
        }
      }

      // Coordinates when zoomed in
      if (editorState.showCoordinates && zoom > 4) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = `${Math.max(5, size * 0.18)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`${hex.x},${hex.y}`, px, py - size * 0.3);
      }

      ctx.globalAlpha = 1;
    }

    // Center marker
    const [cx, cy] = hexToPixel(0, 0, size);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Fleet markers
    for (const fleet of fleets) {
      const [fx, fy] = hexToPixel(fleet.hex_x, fleet.hex_y, size);
      if (fx < left || fx > right || fy < top || fy > bottom) continue;

      const fleetColor = CLASSIFICATION_COLORS[fleet.owner_classification as HexClassification] || "#fff";

      // Fleet triangle marker
      const triSize = size * 0.5;
      ctx.fillStyle = fleetColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy - triSize);
      ctx.lineTo(fx + triSize * 0.8, fy + triSize * 0.5);
      ctx.lineTo(fx - triSize * 0.8, fy + triSize * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Fleet name when zoomed
      if (zoom > 2) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(6, size * 0.25)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(fleet.fleet_name, fx, fy + triSize + size * 0.4);
      }
    }

    ctx.restore();
  }, [hexes, systems, fleets, editorState, showPlanetSizes, ownerColorMap]);

  useEffect(() => {
    const loop = () => {
      draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // Mouse handlers
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

  const pendingClickRef = useRef<{ hex: HexData; startX: number; startY: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
        return;
      }
      if (e.button === 0) {
        const hex = getHexAtMouse(e);

        if (editorState.tool === "select") {
          // Left-drag pans the map; click (no drag past 5px) selects
          setIsDragging(true);
          setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
          pendingClickRef.current = hex ? { hex, startX: e.clientX, startY: e.clientY } : null;
          return;
        }

        if (!hex) return;
        if (editorState.tool === "paint") {
          setIsPainting(true);
          onPaintHex(hex);
        } else if (editorState.tool === "fill") {
          onFloodFill(hex);
        } else if (editorState.tool === "brush") {
          setIsPainting(true);
          const radius = brushRadius(editorState.brushSize);
          const affected = getHexesInRadius(hex.x, hex.y, radius, hexes);
          onBrushPaint(affected);
        }
      }
    },
    [camera, getHexAtMouse, editorState, onPaintHex, onFloodFill, onBrushPaint, hexes]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setCamera((c) => ({
          ...c,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        }));
        // Cancel pending click if mouse moved past 5px threshold
        const pc = pendingClickRef.current;
        if (pc && (Math.abs(e.clientX - pc.startX) > 5 || Math.abs(e.clientY - pc.startY) > 5)) {
          pendingClickRef.current = null;
        }
        return;
      }
      const hex = getHexAtMouse(e);
      onHexHover(hex ? hexKey(hex.x, hex.y) : null);

      if (isPainting && hex) {
        if (editorState.tool === "paint") {
          onPaintHex(hex);
        } else if (editorState.tool === "brush") {
          const radius = brushRadius(editorState.brushSize);
          const affected = getHexesInRadius(hex.x, hex.y, radius, hexes);
          onBrushPaint(affected);
        }
      }
    },
    [isDragging, dragStart, getHexAtMouse, onHexHover, isPainting, editorState, onPaintHex, onBrushPaint, hexes]
  );

  const handleMouseUp = useCallback(() => {
    if (pendingClickRef.current) {
      onHexClick(pendingClickRef.current.hex);
      pendingClickRef.current = null;
    }
    setIsDragging(false);
    setIsPainting(false);
  }, [onHexClick]);

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

  // Recenter on a specific hex when requested
  useEffect(() => {
    if (!centerOnHex) return;
    setCamera((c) => {
      const zoom = Math.max(c.zoom, 2);
      const size = HEX_SIZE * zoom;
      const [px, py] = hexToPixel(centerOnHex.x, centerOnHex.y, size);
      return { x: -px, y: -py, zoom };
    });
  }, [centerOnHex?.nonce]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
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
      <div className="absolute bottom-2 left-2 flex gap-2">
        <button
          onClick={centerMap}
          className="rounded bg-muted/80 px-2 py-1 text-xs text-foreground hover:bg-muted"
        >
          Center (0,0)
        </button>
        <span className="rounded bg-muted/80 px-2 py-1 text-xs text-foreground">
          Zoom: {camera.zoom.toFixed(1)}x
        </span>
      </div>
      {editorState.hoveredHexKey && hexes.get(editorState.hoveredHexKey) && (() => {
        const h = hexes.get(editorState.hoveredHexKey!)!;
        const sys = systems.get(h.hex_id);
        return (
          <div className="absolute top-2 left-2 rounded bg-muted/90 px-3 py-2 text-xs text-foreground">
            <div>Coords: ({h.x}, {h.y})</div>
            <div>Class: {h.classification}</div>
            {sys && <div>System: {sys.system_name}</div>}
          </div>
        );
      })()}
    </div>
  );
};

export default HexMapCanvas;
