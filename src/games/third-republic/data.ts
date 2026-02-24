import game1 from "@/assets/game1.jpg";
import { Game } from "@/games/types";

const thirdRepublic: Game = {
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
};

export default thirdRepublic;
