import game1 from "@/assets/game1.jpg";
import { Game } from "@/games/types";

const thirdRepublic: Game = {
  id: "third-republic",
  title: "Third Republic",
  description:
    "A tactical politics and war game where players compete for control of the republic and collaborate against an alien threat.",
  pitch:
    "Lead the Republic through war and diplomacy in this hex-based, simultaneous-resolution game based on a popular Play By Mail.",
  image: game1,
  screenshots: [game1],
  features: [
    "Hex-based tactical combat with line-of-sight mechanics",
    "Propose and vote on resolutions",
    "Deep strategy and combat simulation",
    "Asynchronous multiplayer",
  ],
  platforms: ["Windows", "macOS", "Linux"],
  inDevelopment: true,
};

export default thirdRepublic;
