import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import { games } from "@/data/games";

const Index = () => {
  const activeGame = games.find((g) => g.inDevelopment);
  const upcomingGames = games.filter((g) => !g.inDevelopment);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Currently in Development */}
      <section className="border-b border-border">
        <div className="container py-20">
          <p className="text-xs font-medium uppercase tracking-widest text-gold">Currently in Development</p>
          {activeGame && (
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div className="aspect-video overflow-hidden border border-border">
                <img
                  src={activeGame.image}
                  alt={activeGame.title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col justify-center">
                <h2 className="font-heading text-3xl font-bold text-foreground">{activeGame.title}</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{activeGame.description}</p>
                <div className="mt-6">
                  <Link
                    to={`/games/${activeGame.id}`}
                    className="inline-flex h-10 items-center border border-primary bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Upcoming Titles */}
      <section className="border-b border-border">
        <div className="container py-20">
          <h2 className="font-heading text-2xl font-semibold text-foreground">Future Titles</h2>
          <p className="mt-2 text-sm text-muted-foreground">Not yet in development</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {upcomingGames.map((game) => (
              <div key={game.id} className="border border-border bg-card p-5 opacity-60">
                <div className="aspect-video overflow-hidden border border-border">
                  <img
                    src={game.image}
                    alt={game.title}
                    className="h-full w-full object-cover grayscale"
                    loading="lazy"
                  />
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-foreground">{game.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{game.description}</p>
                  </div>
                  <span className="shrink-0 border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Planned
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="border-b border-border">
        <div className="container py-20">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl font-semibold text-foreground">About the Studio</h2>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              MiniGiantGames is a three-person independent studio focused exclusively on strategy 
              and simulation. We're designers, engineers, and lifelong strategy players building 
              the games we've always wanted to exist.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-6">
              <div className="border-t border-border pt-4">
                <p className="font-heading text-2xl font-bold text-foreground">3</p>
                <p className="mt-1 text-xs text-muted-foreground">Team Members</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="font-heading text-2xl font-bold text-foreground">3</p>
                <p className="mt-1 text-xs text-muted-foreground">Games in Development</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="font-heading text-2xl font-bold text-gold">∞</p>
                <p className="mt-1 text-xs text-muted-foreground">Depth Per Game</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section id="newsletter">
        <div className="container py-20">
          <div className="max-w-lg">
            <h2 className="font-heading text-2xl font-semibold text-foreground">Stay Updated</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Development logs, release dates, and behind-the-scenes updates. No spam.
            </p>
            <div className="mt-6">
              <Newsletter />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
