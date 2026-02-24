import game3 from "@/assets/game3.jpg";
import { Game } from "@/games/types";

const crownAndCharter: Game = {
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
};

export default crownAndCharter;
