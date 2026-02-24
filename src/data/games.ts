import game1 from "@/assets/game1.jpg";
import game2 from "@/assets/game2.jpg";
import game3 from "@/assets/game3.jpg";

export interface Game {
  id: string;
  title: string;
  description: string;
  pitch: string;
  image: string;
  screenshots: string[];
  features: string[];
  platforms: string[];
  inDevelopment: boolean;
}

export const games: Game[] = [
  {
    id: "third-republic",
    title: "Third Republic",
    description: "A hex-based tactical wargame where every decision shapes the theater of war.",
    pitch: "Command combined-arms forces across procedurally generated theaters. Third Republic rewards careful planning, logistics management, and operational-level thinking over reflexes.",
    image: game1,
    screenshots: [game1],
    features: [
      "Hex-based tactical combat with line-of-sight mechanics",
      "Procedurally generated campaign maps",
      "Deep logistics and supply chain simulation",
      "Moddable unit editor and scenario builder",
      "Asynchronous multiplayer support",
    ],
    platforms: ["Windows", "macOS", "Linux"],
    inDevelopment: true,
  },
  {
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
  },
  {
    id: "crown-and-charter",
    title: "Crown & Charter",
    description: "A medieval kingdom simulator focused on governance, law, and the cost of power.",
    pitch: "Build a kingdom not through conquest alone, but through law, taxation, and political maneuvering. Every edict you pass ripples through your realm.",
    image: game3,
    screenshots: [game3],
    features: [
      "Deep governance and law system",
      "Dynamic population with needs and opinions",
      "Seasonal economy and agricultural simulation",
      "Court intrigue and advisor management",
      "Procedural historical chronicle",
    ],
    platforms: ["Windows", "macOS", "Linux"],
    inDevelopment: false,
  },
];
