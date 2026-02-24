import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GameCard from "@/components/GameCard";
import Newsletter from "@/components/Newsletter";
import { games } from "@/data/games";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Featured Games */}

      {/* Featured Games - duplicate removed */}
      <section className="border-b border-border">
        <div className="container py-20">
          <h2 className="font-heading text-2xl font-semibold text-foreground">Featured Games</h2>
          <p className="mt-2 text-sm text-muted-foreground">Currently in development</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
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

      {/* Philosophy */}
      <section className="border-b border-border">
        <div className="container py-20">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl font-semibold text-foreground">Our Philosophy</h2>
            <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                We believe the best games are systems you learn to read, not stories you're told. 
                Every mechanic should create meaningful choices. Every number should matter.
              </p>
              <p>
                We draw inspiration from the golden age of strategy gaming—SSI, Microprose, 
                the early Paradox titles—and bring those ideas forward with modern design 
                sensibility and clean interfaces.
              </p>
              <p>
                No loot boxes. No filler content. Just deep, replayable systems built by people 
                who play the games they make.
              </p>
            </div>
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
