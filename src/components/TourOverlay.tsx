import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTour } from "../contexts/TourContext";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

function getTargetRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

// ── Spotlight ─────────────────────────────────────────────────────────────────

function Spotlight({ rect }: { rect: Rect }) {
  return (
    <div
      className="tour-spotlight"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

// ── Step Popover ──────────────────────────────────────────────────────────────

interface PopoverProps {
  rect: Rect | null;
  placement: "top" | "bottom" | "left" | "right";
  stepIndex: number;
  totalSteps: number;
  title: string;
  content: string;
  onPrev: () => void;
  onNext: () => void;
  onComplete: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function StepPopover({
  rect,
  placement,
  stepIndex,
  totalSteps,
  title,
  content,
  onPrev,
  onNext,
  onComplete,
  isFirst,
  isLast,
}: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useLayoutEffect(() => {
    if (!popRef.current) return;
    const pop = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;

    if (!rect) {
      // 置中
      setPos({
        top: vh / 2 - pop.height / 2,
        left: vw / 2 - pop.width / 2,
      });
      return;
    }

    let top = 0;
    let left = 0;

    if (placement === "bottom") {
      top = rect.top + rect.height + gap;
      left = rect.left + rect.width / 2 - pop.width / 2;
    } else if (placement === "top") {
      top = rect.top - pop.height - gap;
      left = rect.left + rect.width / 2 - pop.width / 2;
    } else if (placement === "right") {
      top = rect.top + rect.height / 2 - pop.height / 2;
      left = rect.left + rect.width + gap;
    } else {
      top = rect.top + rect.height / 2 - pop.height / 2;
      left = rect.left - pop.width - gap;
    }

    // 邊界保護
    left = Math.max(12, Math.min(left, vw - pop.width - 12));
    top = Math.max(12, Math.min(top, vh - pop.height - 12));

    setPos({ top, left });
  }, [rect, placement]);

  return (
    <div
      ref={popRef}
      className="tour-popover"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="tour-popover-header">
        <span className="tour-popover-title">{title}</span>
      </div>
      <p className="tour-popover-content">{content}</p>
      <p className="tour-popover-hint">按 Esc 可中止導覽並離開目前流程。</p>
      <div className="tour-popover-footer">
        <span className="tour-popover-progress">
          {stepIndex + 1} / {totalSteps}
        </span>
        <div className="tour-popover-actions">
          {!isFirst && (
            <button className="tour-btn tour-btn-secondary" onClick={onPrev}>
              上一步
            </button>
          )}
          {isLast ? (
            <button className="tour-btn tour-btn-primary" onClick={onComplete}>
              完成 🎉
            </button>
          ) : (
            <button className="tour-btn tour-btn-primary" onClick={onNext}>
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TourOverlay() {
  const {
    isActive,
    step,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    endTour,
  } = useTour();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      endTour();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [endTour, isActive]);

  useEffect(() => {
    if (!isActive || !step?.target) {
      return;
    }
    let frameCount = 0;
    let rafId = 0;

    const syncRect = () => {
      const rect = getTargetRect(step.target!);
      setTargetRect(rect);
      if (!rect && frameCount < 24) {
        frameCount += 1;
        rafId = requestAnimationFrame(syncRect);
      }
    };

    syncRect();
    window.addEventListener("resize", syncRect);
    window.addEventListener("scroll", syncRect, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", syncRect);
      window.removeEventListener("scroll", syncRect, true);
      // Reset spotlight when step or active state changes.
      setTargetRect(null);
    };
  }, [isActive, step]);

  if (!isActive || !step) return null;

  const placement = step.placement ?? "bottom";

  return (
    <>
      {/* 半透明遮罩 */}
      <div className="tour-overlay" aria-hidden="true" />
      {/* Spotlight 挖洞 */}
      {targetRect && <Spotlight rect={targetRect} />}
      {/* 說明泡泡 */}
      <StepPopover
        rect={targetRect}
        placement={placement}
        stepIndex={currentStep}
        totalSteps={totalSteps}
        title={step.title}
        content={step.content}
        onPrev={prevStep}
        onNext={nextStep}
        onComplete={endTour}
        isFirst={currentStep === 0}
        isLast={currentStep === totalSteps - 1}
      />
    </>
  );
}
