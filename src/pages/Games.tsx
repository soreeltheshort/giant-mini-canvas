import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GameCard from "@/components/GameCard";
import { games } from "@/games";

const Games = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section>
        <div className="container py-20">
          <h1 className="font-heading text-3xl font-bold text-foreground">Games</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Strategy and simulation titles currently in development.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard
                key={game.id}
                id={game.id}
                title={game.title}
                description={game.description}
                image={game.image}
              />
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default Games;
