import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import logo from "@/assets/mini-giant-games-logo.png";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="About Us — Mini Giant Games"
        description="Mini Giant Games is an independent studio building deep, replayable strategy and simulation games."
        path="/about"
      />
      <Header />
      <main>
        <section>
          <div className="container py-16 max-w-3xl">
            <div className="flex justify-center">
              <img
                src={logo}
                alt="Mini Giant Games"
                className="w-full max-w-xs h-auto rounded-sm shadow-[0_8px_30px_-12px_hsl(var(--bronze)/0.5)]"
              />
            </div>

            <p className="mt-12 text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark text-center">
              About the Studio
            </p>
            <h1 className="mt-4 font-heading text-4xl md:text-5xl font-bold text-foreground tracking-tight text-center">
              Deep games, artisanal craft.
            </h1>
            <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-crimson to-transparent" />

            <div className="mt-10 space-y-6 text-base leading-relaxed text-muted-foreground">
              <p>
                Mini Giant Games is an independent studio designing strategy and simulation
                games with the depth of a wargame and the readability of a board game. We
                build for players who want decisions that matter — not loops that pacify.
              </p>
              <p>
                Our work is small in team size and large in scope. Every system we ship is
                hand-tuned, every rule is in service of a moment a player will remember.
                We move slowly on purpose, because the games we want to play don't exist
                yet and they're worth the time to build properly.
              </p>
              <p>
                <span className="text-foreground font-semibold">Currently in development:</span>{" "}
                <em>Third Republic</em> — a tactical space wargame of senate intrigue,
                simultaneous-turn fleet combat, ground invasions, and an encroaching alien
                threat.
              </p>
            </div>

            <div className="mt-16 grid gap-8 md:grid-cols-3 border-t-2 border-bronze/40 pt-12">
              <div>
                <p className="font-heading text-xs font-semibold uppercase tracking-widest text-crimson">
                  What we make
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Strategy and simulation games with deterministic systems and long
                  decision horizons.
                </p>
              </div>
              <div>
                <p className="font-heading text-xs font-semibold uppercase tracking-widest text-crimson">
                  How we work
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Small team. Public devlogs. Open playtesting. Every release is a working
                  prototype before it's a product.
                </p>
              </div>
              <div>
                <p className="font-heading text-xs font-semibold uppercase tracking-widest text-crimson">
                  Where we're going
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  One ambitious title at a time, built to last and built to replay.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
