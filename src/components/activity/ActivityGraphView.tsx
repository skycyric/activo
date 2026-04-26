import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityWithContext } from "../ActivityPage";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  "not-started": "#94a3b8",
  attention: "#f59e0b",
  "in-progress": "#3b82f6",
  completed: "#22c55e",
};

function strToHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h % 360;
}

interface GraphNode {
  id: string;
  act: ActivityWithContext;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  statusColor: string;
  label: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface ViewState {
  tx: number;
  ty: number;
  scale: number;
}

export default function ActivityGraphView({
  activities,
  allActivities: _allActivities,
  onJumpToActivity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const frameRef = useRef<number>(0);
  const iterRef = useRef<number>(0);
  const viewRef = useRef<ViewState>({ tx: 0, ty: 0, scale: 1 });
  const sizeRef = useRef({ w: 800, h: 600 });

  // drag state: null | {type:"node",id,ox,oy,startX,startY} | {type:"pan",sx,sy,stx,sty}
  const dragRef = useRef<
    | {
        type: "node";
        id: string;
        ox: number;
        oy: number;
        startX: number;
        startY: number;
      }
    | { type: "pan"; sx: number; sy: number; stx: number; sty: number }
    | null
  >(null);
  const hoveredRef = useRef<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    act: ActivityWithContext;
  } | null>(null);

  // Build graph nodes/edges when activities change
  useEffect(() => {
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    const idSet = new Set(activities.map((a) => a.id));

    const deptHues: Record<string, number> = {};
    activities.forEach((a) => {
      if (!(a.deptId in deptHues)) deptHues[a.deptId] = strToHue(a.deptId);
    });

    nodesRef.current = activities.map((act) => {
      const hue = deptHues[act.deptId] ?? 200;
      return {
        id: act.id,
        act,
        x: W / 2 + (Math.random() - 0.5) * Math.min(W, 600),
        y: H / 2 + (Math.random() - 0.5) * Math.min(H, 400),
        vx: 0,
        vy: 0,
        r: 22,
        color: `hsl(${hue}, 55%, 52%)`,
        statusColor: STATUS_COLORS[act.status ?? "not-started"] ?? "#94a3b8",
        label: (act.rawText ?? "").slice(0, 16),
      };
    });

    edgesRef.current = [];
    activities.forEach((act) => {
      (act.prerequisites ?? []).forEach((preId) => {
        if (idSet.has(preId)) {
          edgesRef.current.push({ source: preId, target: act.id });
        }
      });
    });

    iterRef.current = 0;
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
  }, [activities]);

  // Canvas render + physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      sizeRef.current = { w, h };
      dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();

    const ro = new ResizeObserver(() => resize());
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const drawFrame = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const W = sizeRef.current.w;
      const H = sizeRef.current.h;

      // Physics
      if (iterRef.current < 400 && nodes.length > 0) {
        const K_REPULSE = nodes.length < 20 ? 8000 : 5000;
        const K_SPRING = 0.035;
        const IDEAL_LEN = 140;
        const GRAVITY = 0.006;
        const DAMP = 0.78;
        const cx = W / 2;
        const cy = H / 2;

        // Gravity toward center
        for (const n of nodes) {
          n.vx += (cx - n.x) * GRAVITY;
          n.vy += (cy - n.y) * GRAVITY;
        }

        // Repulsion (O(n²), fine for <200 nodes)
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const f = K_REPULSE / (dist * dist);
            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }

        // Spring along edges
        const nodeMap = new Map(nodes.map((n) => [n.id, n]));
        for (const e of edges) {
          const src = nodeMap.get(e.source);
          const tgt = nodeMap.get(e.target);
          if (!src || !tgt) continue;
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = K_SPRING * (dist - IDEAL_LEN);
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          src.vx += fx;
          src.vy += fy;
          tgt.vx -= fx;
          tgt.vy -= fy;
        }

        for (const n of nodes) {
          const isDragged =
            dragRef.current?.type === "node" && dragRef.current.id === n.id;
          if (isDragged) continue;
          n.vx *= DAMP;
          n.vy *= DAMP;
          n.x += n.vx;
          n.y += n.vy;
        }
        iterRef.current++;
      }

      // Render
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const { tx, ty, scale } = viewRef.current;
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);

      const nodeMap2 = new Map(nodes.map((n) => [n.id, n]));

      // Draw edges with arrows
      for (const e of edges) {
        const src = nodeMap2.get(e.source);
        const tgt = nodeMap2.get(e.target);
        if (!src || !tgt) continue;

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const x1 = src.x + ux * src.r;
        const y1 = src.y + uy * src.r;
        const arrowGap = tgt.r + 9;
        const x2 = tgt.x - ux * arrowGap;
        const y2 = tgt.y - uy * arrowGap;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = "rgba(100,116,139,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - 9 * Math.cos(angle - 0.42),
          y2 - 9 * Math.sin(angle - 0.42),
        );
        ctx.lineTo(
          x2 - 9 * Math.cos(angle + 0.42),
          y2 - 9 * Math.sin(angle + 0.42),
        );
        ctx.closePath();
        ctx.fillStyle = "rgba(100,116,139,0.6)";
        ctx.fill();
      }

      // Draw nodes
      for (const n of nodes) {
        const isHov = hoveredRef.current === n.id;
        const r = isHov ? n.r + 4 : n.r;

        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = isHov ? 12 : 5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = n.statusColor;
        ctx.lineWidth = isHov ? 3.5 : 2.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `${isHov ? 600 : 500} ${isHov ? 11 : 10}px system-ui,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const maxW = r * 2 - 6;
        let lbl = n.label;
        if (ctx.measureText(lbl).width > maxW) {
          while (lbl.length > 1 && ctx.measureText(lbl + "…").width > maxW)
            lbl = lbl.slice(0, -1);
          lbl += "…";
        }
        ctx.fillText(lbl, n.x, n.y);
      }

      ctx.restore();
      frameRef.current = requestAnimationFrame(drawFrame);
    };

    frameRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, []);

  const toWorld = useCallback((cx: number, cy: number): [number, number] => {
    const { tx, ty, scale } = viewRef.current;
    return [(cx - tx) / scale, (cy - ty) / scale];
  }, []);

  const hitTest = useCallback((wx: number, wy: number): GraphNode | null => {
    for (const n of nodesRef.current) {
      const dx = n.x - wx;
      const dy = n.y - wy;
      if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) return n;
    }
    return null;
  }, []);

  const getCanvasXY = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const { cx, cy } = getCanvasXY(e);
    const [wx, wy] = toWorld(cx, cy);
    const hit = hitTest(wx, wy);
    if (hit) {
      dragRef.current = {
        type: "node",
        id: hit.id,
        ox: wx - hit.x,
        oy: wy - hit.y,
        startX: cx,
        startY: cy,
      };
      canvasRef.current!.style.cursor = "grabbing";
    } else {
      const { tx, ty } = viewRef.current;
      dragRef.current = { type: "pan", sx: cx, sy: cy, stx: tx, sty: ty };
      canvasRef.current!.style.cursor = "grabbing";
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { cx, cy } = getCanvasXY(e);
    const [wx, wy] = toWorld(cx, cy);
    const drag = dragRef.current;

    if (drag) {
      if (drag.type === "node") {
        const node = nodesRef.current.find((n) => n.id === drag.id);
        if (node) {
          node.x = wx - drag.ox;
          node.y = wy - drag.oy;
          node.vx = 0;
          node.vy = 0;
        }
      } else {
        viewRef.current.tx = drag.stx + (cx - drag.sx);
        viewRef.current.ty = drag.sty + (cy - drag.sy);
      }
    }

    const hit = hitTest(wx, wy);
    const prevHov = hoveredRef.current;
    hoveredRef.current = hit?.id ?? null;

    if (hit?.id !== prevHov) {
      if (hit) {
        setTooltip({ x: cx, y: cy, act: hit.act });
        if (!drag) canvasRef.current!.style.cursor = "pointer";
      } else {
        setTooltip(null);
        if (!drag) canvasRef.current!.style.cursor = "grab";
      }
    } else if (hit) {
      // Update position
      setTooltip((prev) => (prev ? { ...prev, x: cx, y: cy } : null));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (drag?.type === "node") {
      const { cx, cy } = getCanvasXY(e);
      const dx = cx - drag.startX;
      const dy = cy - drag.startY;
      // Click if barely moved
      if (dx * dx + dy * dy < 25) {
        const node = nodesRef.current.find((n) => n.id === drag.id);
        if (node) onJumpToActivity(node.act.deptId, node.id);
      }
    }
    dragRef.current = null;
    const [wx, wy] = toWorld(
      e.clientX - canvasRef.current!.getBoundingClientRect().left,
      e.clientY - canvasRef.current!.getBoundingClientRect().top,
    );
    canvasRef.current!.style.cursor = hitTest(wx, wy) ? "pointer" : "grab";
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { cx, cy } = getCanvasXY(e);
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    const v = viewRef.current;
    const newScale = Math.max(0.08, Math.min(5, v.scale * factor));
    v.tx = cx - (cx - v.tx) * (newScale / v.scale);
    v.ty = cy - (cy - v.ty) * (newScale / v.scale);
    v.scale = newScale;
  };

  const handleLeave = () => {
    dragRef.current = null;
    hoveredRef.current = null;
    setTooltip(null);
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  };

  return (
    <div ref={containerRef} className="act-graph-container">
      {activities.length === 0 && (
        <div className="act-empty">
          <div className="act-empty-icon">◎</div>
          <div className="act-empty-text">沒有符合條件的活動</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="act-graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleLeave}
        onWheel={handleWheel}
        style={{ cursor: "grab" }}
      />
      {tooltip && (
        <div
          className="act-graph-tooltip"
          style={{ left: tooltip.x + 16, top: tooltip.y - 12 }}
        >
          <div className="act-graph-tooltip-name">
            {tooltip.act.rawText || "未命名"}
          </div>
          <div className="act-graph-tooltip-meta">
            {tooltip.act.deptName}
            {tooltip.act.owner ? ` · ${tooltip.act.owner}` : ""}
          </div>
          {tooltip.act.tags && tooltip.act.tags.length > 0 && (
            <div className="act-graph-tooltip-tags">
              {tooltip.act.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          <div className="act-graph-tooltip-hint">點擊開啟詳情</div>
        </div>
      )}
      <div className="act-graph-legend">
        <div className="act-graph-legend-title">狀態（邊框色）</div>
        {(
          [
            ["not-started", "未開始", "#94a3b8"],
            ["in-progress", "進行中", "#3b82f6"],
            ["attention", "注意", "#f59e0b"],
            ["completed", "已完成", "#22c55e"],
          ] as const
        ).map(([, label, color]) => (
          <div key={label} className="act-graph-legend-item">
            <span
              className="act-graph-legend-dot"
              style={{ borderColor: color }}
            />
            <span>{label}</span>
          </div>
        ))}
        <div className="act-graph-legend-sep" />
        <div className="act-graph-legend-hint">滾輪縮放 · 拖拽節點或背景</div>
        <div className="act-graph-legend-hint">→ 箭頭 = 前置關係</div>
      </div>
    </div>
  );
}
