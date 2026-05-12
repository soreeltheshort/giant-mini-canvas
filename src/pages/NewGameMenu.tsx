import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

export default function NewGameMenu() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container py-20">
        <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
          Command Console
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold text-foreground">New Game</h1>
        <div className="mt-3 h-px w-24 bg-gradient-to-r from-bronze via-crimson to-transparent" />
        <p className="mt-5 max-w-xl text-sm text-muted-foreground">
          Choose how to begin your campaign. (Placeholder menu — full new-game flow coming soon.)
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2 max-w-3xl">
          <div className="border-2 border-bronze/40 bg-ivory rounded-sm p-6 hover:border-bronze transition-colors">
            <h2 className="font-heading text-xl font-bold text-foreground">Quick Skirmish</h2>
            <p className="mt-2 text-sm text-muted-foreground">Jump into a short scripted scenario for testing.</p>
            <Button disabled className="mt-4 font-heading uppercase tracking-wider" variant="outline">Coming Soon</Button>
          </div>
          <div className="border-2 border-bronze/40 bg-ivory rounded-sm p-6 hover:border-bronze transition-colors">
            <h2 className="font-heading text-xl font-bold text-foreground">Campaign</h2>
            <p className="mt-2 text-sm text-muted-foreground">Begin a full multiplayer campaign in the Third Republic.</p>
            <Button disabled className="mt-4 font-heading uppercase tracking-wider" variant="outline">Coming Soon</Button>
          </div>
          <div className="border-2 border-bronze/40 bg-ivory rounded-sm p-6 hover:border-bronze transition-colors">
            <h2 className="font-heading text-xl font-bold text-foreground">Tutorial</h2>
            <p className="mt-2 text-sm text-muted-foreground">Learn the systems with a guided playthrough.</p>
            <Button disabled className="mt-4 font-heading uppercase tracking-wider" variant="outline">Coming Soon</Button>
          </div>
          <div className="border-2 border-bronze/40 bg-ivory rounded-sm p-6 hover:border-bronze transition-colors">
            <h2 className="font-heading text-xl font-bold text-foreground">Resume</h2>
            <p className="mt-2 text-sm text-muted-foreground">Return to an existing game in progress.</p>
            <Link to="/my-games">
              <Button className="mt-4 font-heading uppercase tracking-wider bg-crimson hover:bg-crimson-light text-primary-foreground">
                My Games →
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <Link to="/" className="text-sm font-heading uppercase tracking-wider text-bronze-dark hover:text-foreground">
            ← Back to Home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
