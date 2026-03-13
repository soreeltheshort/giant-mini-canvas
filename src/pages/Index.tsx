import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import { games } from "@/games";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const Index = () => {
  const activeGame = games.find((g) => g.inDevelopment);
  const { user, isAdmin, isTester } = useAuth();
  const canAccessTesting = isAdmin || isTester;

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
                <img src={activeGame.image} alt={activeGame.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col justify-center">
                <h2 className="font-heading text-3xl font-bold text-foreground">{activeGame.title}</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{activeGame.description}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={`/games/${activeGame.id}`} className="inline-flex h-10 items-center border border-primary bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    View Details →
                  </Link>
                  {activeGame.id === "third-republic" && !user && (
                    <Link to="/signup">
                      <Button variant="outline">Create Free Account</Button>
                    </Link>
                  )}
                  {activeGame.id === "third-republic" && canAccessTesting && (
                    <>
                      <Link to="/dashboard">
                        <Button className="bg-gold text-secondary-foreground hover:bg-gold/90">⚔ Combat Testing</Button>
                      </Link>
                      <Link to="/map-testing">
                        <Button variant="outline">🗺 Map Testing</Button>
                      </Link>
                      <Link to="/planet-testing">
                        <Button variant="outline">🌍 Planet Testing</Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
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
