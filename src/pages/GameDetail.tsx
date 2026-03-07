import { useParams, Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import { games } from "@/games";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const GameDetail = () => {
  const { id } = useParams<{ id: string }>();
  const game = games.find((g) => g.id === id);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!game) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="font-heading text-2xl font-bold text-foreground">Game not found</h1>
          <Link to="/games" className="mt-4 inline-block text-sm text-primary hover:text-foreground">
            ← Back to Games
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const isThirdRepublic = game.id === "third-republic";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Screenshot */}
      <div className="aspect-[21/9] w-full overflow-hidden border-b border-border">
        <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
      </div>

      <div className="container py-16">
        <Link to="/games" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back to Games
        </Link>

        <div className="mt-8 max-w-2xl">
          <h1 className="font-heading text-3xl font-bold text-foreground">{game.title}</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{game.pitch}</p>

          {/* Auth / Combat Testing CTA */}
          {isThirdRepublic && (
            <div className="mt-6 flex gap-3">
              {user ? (
                <Button
                  onClick={() => navigate("/dashboard")}
                  className="bg-gold text-secondary-foreground hover:bg-gold/90"
                >
                  ⚔ Combat Testing
                </Button>
              ) : (
                <>
                  <Link to="/login">
                    <Button>Sign In</Button>
                  </Link>
                  <Link to="/signup">
                    <Button variant="outline">Create Free Account</Button>
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Platforms */}
          <div className="mt-6 flex gap-2">
            {game.platforms.map((p) => (
              <span key={p} className="border border-border px-3 py-1 text-xs text-muted-foreground">
                {p}
              </span>
            ))}
          </div>

          {/* Features */}
          <div className="mt-10">
            <h2 className="font-heading text-lg font-semibold text-foreground">Features</h2>
            <ul className="mt-4 space-y-2">
              {game.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-1.5 h-1 w-1 shrink-0 bg-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Wishlist */}
          <div className="mt-10">
            <button className="inline-flex h-10 items-center border border-gold bg-transparent px-6 text-sm font-medium text-gold transition-colors hover:bg-gold hover:text-secondary-foreground">
              Wishlist on Steam
            </button>
          </div>

          {/* Dev Updates */}
          <div className="mt-16 border-t border-border pt-10">
            <h2 className="font-heading text-lg font-semibold text-foreground">Development Updates</h2>
            <div className="mt-6 space-y-6">
              <div className="border-l-2 border-primary pl-4">
                <p className="text-xs text-muted-foreground">February 2026</p>
                <p className="mt-1 text-sm text-foreground">Core combat at Alpha. Combat playtesting underway.</p>
              </div>
              <div className="border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">January 2026</p>
                <p className="mt-1 text-sm text-foreground">
                  Core rules modified for online play. Rework of concept of who is the player
                </p>
              </div>
              <div className="border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">December 2025</p>
                <p className="mt-1 text-sm text-foreground">Project announced. Development blog launched.</p>
              </div>
            </div>
          </div>

          {/* Newsletter */}
          <div className="mt-16 border-t border-border pt-10">
            <h2 className="font-heading text-lg font-semibold text-foreground">Follow Development</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Get notified about {game.title} updates and release information.
            </p>
            <div className="mt-6">
              <Newsletter />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default GameDetail;
