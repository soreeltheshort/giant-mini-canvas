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
            <div className="flex justify-center opacity-70">
              <img
                src={logo}
                alt="Mini Giant Games"
                className="w-full max-w-[120px] h-auto rounded-sm"
              />
            </div>

            <p className="mt-10 text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark text-center">
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
                  Strategy and simulation games with deterministic systems.
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

            <div className="mt-16 border-t-2 border-bronze/40 pt-12">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                On AI
              </p>
              <h2 className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                AI philosophy
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
                <p>
                  Mini Giant Games believes games are ultimately made by people for people.
                  We value human collaboration, argument, intuition, taste, and the strange
                  creative chemistry that happens when a team sits together wrestling with
                  systems for months or years. There is still a difference between software and a
                  human being with judgment, experience, responsibility, and creative
                  instinct. Until you can share a scotch with an AI after a brutal
                  milestone and argue about naval logistics at 1 AM, the distinction
                  matters.
                </p>
                <p>
                  At the same time, we are not ideological about technology. We prototype
                  aggressively with AI because it is fast, cheap, and often good enough to
                  test mechanics, interfaces, writing structures, and production concepts
                  early. Refusing useful tools out of dogma is just another form of
                  a luxury we can't afford and won't charge you for.
                </p>
              </div>
            </div>

            <div className="mt-16 border-t-2 border-bronze/40 pt-12">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                On Money
              </p>
              <h2 className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                Financial philosophy
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
                <p>
                  Our financial philosophy is equally straightforward. Revenue and
                  investment are not treated as fuel for vanity, dying with the most points
                  (wealth) or speculative growth. The first responsibility of the studio is
                  to survive and pay its bills. The second is to create stable, livable
                  compensation for the developers building and supporting the games over
                  the long term. After that, yes, a little profit. A healthy company should
                  make money both to sustain craftsmanship and independence and because not
                  making some profit feels somewhat unamerican.
                </p>
              </div>
            </div>

            <div className="mt-16 border-t-2 border-bronze/40 pt-12">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                Investor Relations
              </p>
              <h2 className="mt-3 font-heading text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                Build with us
              </h2>
              <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
                <p>
                  Want to be part of something amazing? Interested in great game
                  development done by people who actually know how to competently run a
                  business? Contact us!
                </p>
                <p>
                  <a
                    href="mailto:investors@minigiantgames.com"
                    className="font-heading font-semibold text-crimson hover:text-crimson-dark underline underline-offset-4 decoration-bronze/60"
                  >
                    investors@minigiantgames.com
                  </a>
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
