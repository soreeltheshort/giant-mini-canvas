import { Link } from "react-router-dom";

interface GameCardProps {
  id: string;
  title: string;
  description: string;
  image: string;
  compact?: boolean;
}

const GameCard = ({ id, title, description, image, compact }: GameCardProps) => {
  return (
    <div className="group border border-border bg-card">
      <div className="aspect-video overflow-hidden">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
          loading="lazy"
        />
      </div>
      <div className="p-5">
        <h3 className="font-heading text-lg font-semibold text-accent">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {!compact && (
          <Link
            to={`/games/${id}`}
            className="mt-4 inline-block text-sm font-medium text-primary transition-colors hover:text-foreground"
          >
            View Details →
          </Link>
        )}
      </div>
    </div>
  );
};

export default GameCard;
