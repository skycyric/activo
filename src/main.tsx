import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TourProvider } from "./contexts/TourContext.tsx";
import { TOUR_STEPS } from "./data/tourSteps.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TourProvider steps={TOUR_STEPS}>
      <App />
    </TourProvider>
  </StrictMode>,
);
