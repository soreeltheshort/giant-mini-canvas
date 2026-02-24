import game2 from "@/assets/game2.jpg";
import { Game } from "@/games/types";

const voidCompact: Game = {
  id: "void-compact",
  title: "Void Compact",
  description: "A grand strategy game set in a fractured star cluster where diplomacy is survival.",
  pitch: "Navigate a web of alien factions, trade agreements, and fragile alliances. Every treaty you sign—or break—reshapes the political landscape of the cluster.",
  image: game2,
  screenshots: [game2],
  features: [
    "Dynamic faction diplomacy with emergent alliances",
    "Real-time star map with pausable strategic layer",
    "Resource trading and economic warfare",
    "Fleet composition and doctrine system",
    "Narrative events driven by player choices",
  ],
  platforms: ["Windows", "macOS"],
  inDevelopment: false,
};

export default voidCompact;
