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
