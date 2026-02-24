import game1 from "@/assets/game1.jpg";
import { Game } from "@/games/types";

const thirdRepublic: Game = {
  id: "third-republic",
  title: "Third Republic",
  description: "A tactical war game where commanders design, build and lead fleets in competition with each other and collaborate against an alien threat.",
  pitch: "Design and build your fleets, lead them across hex-based star systems, compete with rival commanders for resources and territory, and unite against a relentless alien threat. Third Republic rewards strategic fleet composition, logistics mastery, and diplomatic cunning.",
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
