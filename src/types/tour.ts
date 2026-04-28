// Tour type definitions extracted from TourContext to allow the context module
// to only export React components/hooks (required for React Fast Refresh).

export type TourPage =
  | "home"
  | "activity"
  | "ogsm"
  | "kpi"
  | "settings"
  | "tags";

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
