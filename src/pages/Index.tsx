import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { games } from "@/games";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="MiniGiantGames — Strategy & Simulation Game Studio"
        description="Independent studio building deep, replayable strategy and simulation games."
        path="/"
      />
      <Header />
      <main>
        <section>
          <div className="container py-20">
            <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
              Mini Giant Games
            </p>
            <h1 className="mt-4 font-heading text-4xl md:text-5xl font-bold text-foreground tracking-tight">
              Games
            </h1>
            <div className="mt-3 h-px w-24 bg-gradient-to-r from-bronze via-crimson to-transparent" />

            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {games.map((game) => (
                <Link
                  key={game.id}
                  to={`/games/${game.id}`}
                  className="group block border-2 border-bronze/40 bg-ivory rounded-sm overflow-hidden hover:border-bronze transition-colors shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]"
                >
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      src={game.image}
                      alt={game.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <h2 className="font-heading text-2xl font-bold text-foreground group-hover:text-crimson transition-colors">
                      {game.title}
                    </h2>
                    {game.pitch && (
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                        {game.pitch}
                      </p>
                    )}
                    <span className="mt-5 inline-block text-xs font-heading font-semibold uppercase tracking-wider text-crimson">
                      View Game →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
