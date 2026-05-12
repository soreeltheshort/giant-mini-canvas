import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const screens = [
  {
    title: "History of the Republic",
    body: "The Third Republic spans a vast network of star systems, bound together by ancient pacts and the iron will of its provincial governors. For centuries, the Republic has stood as a beacon of order in a turbulent galaxy — but beneath the surface, ambition stirs. The provinces grow restless, and a new era is about to begin.",
  },
  {
    title: "Your Province",
    body: "You are the governor of one of the six great provinces of the Republic. Your people look to you for leadership in the trials ahead. The resources under your command, the fleets at your disposal, and the alliances you forge will determine whether your province rises to supremacy or falls into obscurity.",
  },
  {
    title: "Recent Events",
    body: "Tensions across the Republic have reached a breaking point. Trade disputes, border skirmishes, and political maneuvering have fractured the fragile peace. The Senate is gridlocked, and the provinces must now chart their own course. The game is about to begin — your decisions will shape the fate of the Republic.",
  },
];

export default function NewGameIntro() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const screen = screens[step - 1];

  const onContinue = () => {
    if (step < 3) setStep(step + 1);
    else navigate("/new-game/menu");
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-bronze font-heading font-semibold">
            {step} of 3
          </p>
          <h1 className="text-3xl font-heading font-bold text-foreground">{screen.title}</h1>
        </div>
        <div className="laurel-divider">❦</div>
        <p className="text-muted-foreground leading-relaxed text-base">{screen.body}</p>
        <Button
          size="lg"
          onClick={onContinue}
          className="px-10 bg-crimson hover:bg-crimson-light text-primary-foreground font-heading uppercase tracking-wider"
        >
          {step < 3 ? "Continue" : "Enter the Republic"}
        </Button>
      </div>
    </div>
  );
}
