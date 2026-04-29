import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityWithContext } from "../ActivityPage";
import type { TagDictionaryItem } from "../../schemas/ogsm";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  tagDictionary?: TagDictionaryItem[];
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
  kind: "tag";
  score: number;
  level: "weak" | "medium" | "strong";
  sharedTags?: string[];
  sharedCount?: number;
}

interface ViewState {
  tx: number;
  ty: number;
  scale: number;
}

// Tag weights are now stored in tagDictionary (configurable in TagManagementPage).
// Edge visibility/levels use absolute thresholds for stable, predictable semantics.
const EDGE_SHOW_SCORE_THRESHOLD = 0.35;
const EDGE_SHOW_SHARED_TAGS_FLOOR = 3;
const EDGE_LEVEL_STRONG_THRESHOLD = 0.75;
const EDGE_LEVEL_MEDIUM_THRESHOLD = 0.55;

function edgeStyle(edge: GraphEdge): { color: string; width: number } {
  if (edge.level === "strong") {
    return {
      color: "rgba(220,38,38,0.78)",
      width: 1.2 + Math.min(3.8, edge.score * 6),
    };
  }
  if (edge.level === "medium") {
    return {
      color: "rgba(245,158,11,0.72)",
      width: 1.1 + Math.min(3.0, edge.score * 5),
    };
  }
  return {
    color: "rgba(16,185,129,0.62)",
    width: 1 + Math.min(2.2, edge.score * 4),
  };
}

function buildDeptLegend(
  activities: ActivityWithContext[],
): { deptId: string; name: string; color: string }[] {
  const seen = new Map<string, { name: string; color: string }>();
  for (const a of activities) {
    if (!seen.has(a.deptId)) {
      const hue = strToHue(a.deptId);
      seen.set(a.deptId, { name: a.deptName, color: `hsl(${hue}, 55%, 52%)` });
    }
  }
  return Array.from(seen.entries()).map(([deptId, v]) => ({ deptId, ...v }));
}

export default function ActivityGraphView({
  activities,
  allActivities,
  tagDictionary,
  onJumpToActivity,
}: Props) {
  const deptLegendItems = useMemo(
    () => buildDeptLegend(activities),
    [activities],
  );

  const FOCUS_SCALE = 1.35;
  const FOCUS_ANIM_MS = 340;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const frameRef = useRef<number>(0);
  const focusFrameRef = useRef<number | null>(null);
  const iterRef = useRef<number>(0);
  const viewRef = useRef<ViewState>({ tx: 0, ty: 0, scale: 1 });
  const sizeRef = useRef({ w: 800, h: 600 });
  const focusedNodeIdRef = useRef<string | null>(null);

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
  const nodeTopCouplingRef = useRef<Map<string, GraphEdge>>(new Map());
  const [showWeakEdges, setShowWeakEdges] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    act: ActivityWithContext;
    bestEdge?: GraphEdge;
  } | null>(null);

  const stopFocusAnimation = useCallback(() => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
  }, []);

  const centerNodeInView = useCallback((node: GraphNode, scale: number) => {
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;
    viewRef.current.scale = scale;
    viewRef.current.tx = W / 2 - node.x * scale;
    viewRef.current.ty = H / 2 - node.y * scale;
  }, []);

  const animateFocusToNode = useCallback(
    (node: GraphNode, targetScale = FOCUS_SCALE) => {
      stopFocusAnimation();
      const from = { ...viewRef.current };
      const W = sizeRef.current.w;
      const H = sizeRef.current.h;
      const toScale = Math.max(from.scale, targetScale);
      const toTx = W / 2 - node.x * toScale;
      const toTy = H / 2 - node.y * toScale;
      const startAt = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - startAt) / FOCUS_ANIM_MS);
        // Use ease-in-out cubic to reduce abrupt acceleration/deceleration.
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        viewRef.current.scale = from.scale + (toScale - from.scale) * eased;
        viewRef.current.tx = from.tx + (toTx - from.tx) * eased;
        viewRef.current.ty = from.ty + (toTy - from.ty) * eased;
        if (t < 1) {
          focusFrameRef.current = requestAnimationFrame(step);
        } else {
          focusFrameRef.current = null;
        }
      };

      focusFrameRef.current = requestAnimationFrame(step);
    },
    [centerNodeInView, stopFocusAnimation],
  );

  // Build graph nodes/edges when activities change
  useEffect(() => {
    const W = sizeRef.current.w;
    const H = sizeRef.current.h;

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

    // Tag-coupling edges: weighted Jaccard with IDF.

    // Weight map from tag dictionary (user-configurable, default 1.0).
    const tagWeightMap = new Map<string, number>();
    for (const item of tagDictionary ?? []) {
      tagWeightMap.set(item.name, item.weight ?? 1.0);
    }

    // IDF must be computed from ALL dept activities (not just filtered subset)
    // so that coupling scores remain stable when filters change.
    const allTagSetsById = new Map(
      allActivities.map((a) => [
        a.id,
        new Set((a.tags ?? []).map((t) => t.trim()).filter(Boolean)),
      ]),
    );
    const df = new Map<string, number>();
    for (const tags of allTagSetsById.values()) {
      for (const t of tags) df.set(t, (df.get(t) ?? 0) + 1);
    }
    const nTotal = allActivities.length;
    const idf = new Map<string, number>();
    for (const [tag, count] of df.entries()) {
      idf.set(tag, Math.log((nTotal + 1) / (count + 1)) + 1);
    }

    // Tag sets for the currently displayed (filtered) activities.
    const tagSetsById = new Map(
      activities.map((a) => [
        a.id,
        new Set((a.tags ?? []).map((t) => t.trim()).filter(Boolean)),
      ]),
    );

    const tagEdgesRaw: GraphEdge[] = [];
    for (let i = 0; i < activities.length; i++) {
      for (let j = i + 1; j < activities.length; j++) {
        const a = activities[i];
        const b = activities[j];
        const ta = tagSetsById.get(a.id) ?? new Set<string>();
        const tb = tagSetsById.get(b.id) ?? new Set<string>();
        if (ta.size === 0 || tb.size === 0) continue;

        const union = new Set<string>([...ta, ...tb]);
        const shared = [...ta].filter((t) => tb.has(t));
        if (shared.length === 0) continue;

        let num = 0;
        let den = 0;
        for (const t of union) {
          const w = (tagWeightMap.get(t) ?? 1) * (idf.get(t) ?? 1);
          den += w;
          if (ta.has(t) && tb.has(t)) num += w;
        }
        if (den <= 0) continue;
        const score = num / den;
        if (score <= 0) continue;

        tagEdgesRaw.push({
          source: a.id,
          target: b.id,
          kind: "tag",
          score,
          level: "weak",
          sharedTags: shared.slice(0, 4),
          sharedCount: shared.length,
        });
      }
    }

    const qualifiedTagEdges = tagEdgesRaw
      .map((e) => {
        const hasSharedTagFloor =
          (e.sharedCount ?? 0) >= EDGE_SHOW_SHARED_TAGS_FLOOR;
        const passScore = e.score >= EDGE_SHOW_SCORE_THRESHOLD;
        if (!hasSharedTagFloor && !passScore) return null;

        let level: GraphEdge["level"];
        if (e.score >= EDGE_LEVEL_STRONG_THRESHOLD) level = "strong";
        else if (e.score >= EDGE_LEVEL_MEDIUM_THRESHOLD) level = "medium";
        else level = "weak";
        return { ...e, level };
      })
      .filter((e): e is GraphEdge => e !== null)
      .sort((a, b) => b.score - a.score);

    const visibleTagEdges = showWeakEdges
      ? qualifiedTagEdges
      : qualifiedTagEdges.filter((e) => e.level !== "weak");

    edgesRef.current = visibleTagEdges;

    const bestByNode = new Map<string, GraphEdge>();
    for (const e of visibleTagEdges) {
      const prevS = bestByNode.get(e.source);
      if (!prevS || prevS.score < e.score) bestByNode.set(e.source, e);
      const prevT = bestByNode.get(e.target);
      if (!prevT || prevT.score < e.score) bestByNode.set(e.target, e);
    }
    nodeTopCouplingRef.current = bestByNode;

    iterRef.current = 0;
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
  }, [activities, allActivities, tagDictionary, showWeakEdges]);

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

      const focusedId = focusedNodeIdRef.current;
      if (focusedId) {
        const focused = nodesRef.current.find((n) => n.id === focusedId);
        if (focused) {
          centerNodeInView(focused, viewRef.current.scale);
        }
      }
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
        const focusedId = focusedNodeIdRef.current;
        const K_REPULSE = nodes.length < 20 ? 8000 : 5000;
        const K_SPRING = 0.035;
        const IDEAL_LEN = 140;
        const GRAVITY = 0.006;
        const DAMP = 0.78;
        const cx = W / 2;
        const cy = H / 2;

        // Gravity toward center
        for (const n of nodes) {
          if (focusedId && n.id === focusedId) continue;
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
            const aFocused = focusedId && a.id === focusedId;
            const bFocused = focusedId && b.id === focusedId;
            if (!aFocused) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (!bFocused) {
              b.vx += fx;
              b.vy += fy;
            }
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
          const srcFocused = focusedId && src.id === focusedId;
          const tgtFocused = focusedId && tgt.id === focusedId;
          if (!srcFocused) {
            src.vx += fx;
            src.vy += fy;
          }
          if (!tgtFocused) {
            tgt.vx -= fx;
            tgt.vy -= fy;
          }
        }

        for (const n of nodes) {
          const isFocused = focusedId && n.id === focusedId;
          const isDragged =
            dragRef.current?.type === "node" && dragRef.current.id === n.id;
          if (isDragged || isFocused) {
            if (isFocused) {
              n.vx = 0;
              n.vy = 0;
            }
            continue;
          }
          n.vx *= DAMP;
          n.vy *= DAMP;
          n.x += n.vx;
          n.y += n.vy;
        }

        if (focusedId && dragRef.current?.type !== "pan") {
          const focused = nodes.find((n) => n.id === focusedId);
          if (focused) {
            centerNodeInView(focused, viewRef.current.scale);
          }
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

      // Draw tag-coupling edges (undirected, no arrowhead).
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
        const x2 = tgt.x - ux * tgt.r;
        const y2 = tgt.y - uy * tgt.r;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const style = edgeStyle(e);
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.width;
        ctx.stroke();
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
      stopFocusAnimation();
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
    };
  }, [centerNodeInView, stopFocusAnimation]);

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
    stopFocusAnimation();
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
      // User took manual control — stop physics from re-centering focused node.
      focusedNodeIdRef.current = null;
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
        setTooltip({
          x: cx,
          y: cy,
          act: hit.act,
          bestEdge: nodeTopCouplingRef.current.get(hit.id),
        });
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
        if (node) {
          focusedNodeIdRef.current = node.id;
          animateFocusToNode(node);
          onJumpToActivity(node.act.deptId, node.id);
        }
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
    stopFocusAnimation();
    focusedNodeIdRef.current = null; // User zoomed manually — stop auto-centering.
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
    <div
      ref={containerRef}
      className="act-graph-container"
      data-tour="activity-graph-canvas"
    >
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
          {tooltip.bestEdge && (
            <div className="act-graph-tooltip-meta">
              最強關聯：{Math.round(tooltip.bestEdge.score * 100)}% ·
              {tooltip.bestEdge.level === "strong"
                ? " 強"
                : tooltip.bestEdge.level === "medium"
                  ? " 中"
                  : " 弱"}
            </div>
          )}
          {tooltip.bestEdge?.sharedTags &&
            tooltip.bestEdge.sharedTags.length > 0 && (
              <div className="act-graph-tooltip-tags">
                {tooltip.bestEdge.sharedTags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            )}
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
      <div className="act-graph-legend" data-tour="activity-graph-legend">
        <button
          className="act-graph-legend-toggle"
          onClick={() => setLegendOpen((v) => !v)}
          title={legendOpen ? "收合說明" : "展開說明"}
        >
          <span>圖例說明</span>
          <span
            className={`act-graph-legend-caret${legendOpen ? " open" : ""}`}
          >
            ▲
          </span>
        </button>
        {legendOpen && (
          <>
            {/* 節點 - 部門 */}
            <div className="act-graph-legend-title">節點 — 部門</div>
            {deptLegendItems.map((dept) => (
              <div key={dept.deptId} className="act-graph-legend-item">
                <span
                  className="act-graph-legend-dot act-graph-legend-dot--fill"
                  style={{ background: dept.color }}
                />
                <span>{dept.name}</span>
              </div>
            ))}
            <div className="act-graph-legend-sep" />
            {/* 邊框 - 狀態 */}
            <div className="act-graph-legend-title">邊框 — 狀態</div>
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
            {/* 關聯 - Tag 關聯強度 */}
            <div className="act-graph-legend-title">關聯 — Tag 關聯強度</div>
            <div className="act-graph-legend-item">
              <span
                className="act-graph-legend-dot"
                style={{ borderColor: "#ef4444" }}
              />
              <span>強</span>
            </div>
            <div className="act-graph-legend-item">
              <span
                className="act-graph-legend-dot"
                style={{ borderColor: "#f59e0b" }}
              />
              <span>中</span>
            </div>
            <div className="act-graph-legend-item">
              <span
                className="act-graph-legend-dot"
                style={{ borderColor: "#10b981" }}
              />
              <span>弱</span>
            </div>
            <label
              className="act-graph-legend-item"
              style={{ gap: 8 }}
              data-tour="activity-graph-weak-toggle"
            >
              <input
                type="checkbox"
                checked={showWeakEdges}
                onChange={(e) => setShowWeakEdges(e.target.checked)}
              />
              <span>顯示弱關聯連線</span>
            </label>
            <div className="act-graph-legend-sep" />
            <div className="act-graph-legend-hint">
              滾輪縮放 · 拖拽節點或背景
            </div>
            <div className="act-graph-legend-hint">
              顯示規則：score ≥ 35% 或共同標籤 ≥ 3
            </div>
            <div className="act-graph-legend-hint">
              邊粗細代表強度（僅 Tag 關聯邊）
            </div>
          </>
        )}
      </div>
    </div>
  );
}
