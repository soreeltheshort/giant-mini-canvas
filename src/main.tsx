import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { playClick } from "./lib/uiSounds";

// Global UI click sound — fires once per pointerdown on interactive elements.
if (typeof window !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest(
        'button, a, [role="button"], [role="menuitem"], [role="tab"], [role="option"], input[type="checkbox"], input[type="radio"], summary',
      ) as HTMLElement | null;
      if (!interactive) return;
      if (interactive.hasAttribute("disabled") || interactive.getAttribute("aria-disabled") === "true") return;
      // Skip if the element opted out
      if (interactive.dataset.noClickSound === "true") return;
      playClick();
    },
    true,
  );
}

createRoot(document.getElementById("root")!).render(<App />);
