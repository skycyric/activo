import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { TourProvider } from "./contexts/TourContext.tsx";
import { TOUR_STEPS } from "./data/tourSteps.ts";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");
createRoot(rootEl).render(
  <StrictMode>
    <TourProvider steps={TOUR_STEPS}>
      <App />
    </TourProvider>
  </StrictMode>,
);
