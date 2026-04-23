import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TourPage = "home" | "activity" | "ogsm" | "kpi" | "settings";

export interface TourStep {
  id: string;
  /** 這一步要切換到哪個頁面（undefined = 不切換） */
  page?: TourPage;
  /** CSS selector，對應 data-tour 屬性，例如 "[data-tour='home-cards']" */
  target?: string;
  title: string;
  content: string;
  /** 泡泡彈出方向，預設 bottom */
  placement?: "top" | "bottom" | "left" | "right";
}

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep | null;
  startTour: () => void;
  startPageTour: (page: TourPage) => void;
  nextStep: () => void;
  prevStep: () => void;
  endTour: () => void;
  /** App.tsx 呼叫以註冊頁面切換函式 */
  registerNavigate: (fn: (page: TourPage) => void) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface ProviderProps {
  steps: TourStep[];
  children: ReactNode;
}

export function TourProvider({ steps, children }: ProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeStepIndexes, setActiveStepIndexes] = useState<number[]>(() =>
    steps.map((_, index) => index),
  );
  const navigateRef = useRef<((page: TourPage) => void) | null>(null);

  const registerNavigate = useCallback((fn: (page: TourPage) => void) => {
    navigateRef.current = fn;
  }, []);

  const goToStep = useCallback(
    (sequenceIndex: number, stepIndexes: number[] = activeStepIndexes) => {
      if (sequenceIndex < 0 || sequenceIndex >= stepIndexes.length) return;
      const step = steps[stepIndexes[sequenceIndex]];
      if (step.page && navigateRef.current) {
        navigateRef.current(step.page);
      }
      setCurrentStep(sequenceIndex);
    },
    [activeStepIndexes, steps],
  );

  const startSequence = useCallback(
    (stepIndexes: number[]) => {
      if (stepIndexes.length === 0) return;
      setActiveStepIndexes(stepIndexes);
      setCurrentStep(0);
      setIsActive(true);
      const firstStep = steps[stepIndexes[0]];
      if (firstStep?.page && navigateRef.current) {
        navigateRef.current(firstStep.page);
      }
    },
    [steps],
  );

  const startTour = useCallback(() => {
    startSequence(steps.map((_, index) => index));
  }, [startSequence, steps]);

  const startPageTour = useCallback(
    (page: TourPage) => {
      startSequence(
        steps
          .map((step, index) => ({ step, index }))
          .filter(({ step }) => step.page === page)
          .map(({ index }) => index),
      );
    },
    [startSequence, steps],
  );

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= activeStepIndexes.length) {
        setIsActive(false);
        return prev;
      }
      const step = steps[activeStepIndexes[next]];
      if (step.page && navigateRef.current) {
        navigateRef.current(step.page);
      }
      return next;
    });
  }, [activeStepIndexes, steps]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev - 1;
      if (next < 0) return prev;
      goToStep(next);
      return next;
    });
  }, [goToStep]);

  const endTour = useCallback(() => {
    setIsActive(false);
  }, []);

  const step = isActive
    ? (steps[activeStepIndexes[currentStep]] ?? null)
    : null;

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: activeStepIndexes.length,
        step,
        startTour,
        startPageTour,
        nextStep,
        prevStep,
        endTour,
        registerNavigate,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
