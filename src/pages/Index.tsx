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

      {/* Hero */}
      <section className="border-b border-border">
        <div className="container py-24 md:py-32">
          <p className="text-sm font-medium uppercase tracking-widest text-gold">MiniGiantGames</p>
          <h1 className="mt-4 font-heading text-4xl font-bold leading-tight text-foreground md:text-5xl">
            Small Studio.<br />Deep Systems.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
            We build strategy and simulation games with the depth you remember and the design you expect today.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              to="/games"
              className="inline-flex h-10 items-center border border-primary bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View Games
            </Link>
            <a
              href="#newsletter"
              className="inline-flex h-10 items-center border border-border px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Join Newsletter
            </a>
          </div>
        </div>
      </section>

      {/* Featured Games */}
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
