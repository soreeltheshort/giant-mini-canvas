import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PageMeta from "@/components/PageMeta";
import { games } from "@/games";
import logo from "@/assets/mini-giant-games-logo.png";

const Index = () => {
  const inDev = games.find((g) => g.inDevelopment) ?? games[0];

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Mini Giant Games — Strategy & Simulation Game Studio"
        description="Independent studio building deep, replayable strategy and simulation games."
        path="/"
      />
      <Header />
      <main>
        {/* Studio mark */}
        <section>
          <div className="container py-16 flex justify-center">
            <img
              src={logo}
              alt="Mini Giant Games"
              className="w-full max-w-md h-auto rounded-sm shadow-[0_8px_30px_-12px_hsl(var(--bronze)/0.5)]"
            />
          </div>
        </section>

        {/* Now in Development */}
        {inDev && (
          <section className="border-t-2 border-bronze/40">
            <div className="container py-16">
              <div className="flex items-baseline justify-between flex-wrap gap-3">
                <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                  Now in Development
                </p>
                <Link
                  to="/games"
                  className="text-xs font-heading font-semibold uppercase tracking-wider text-crimson hover:text-crimson-light"
                >
                  All Games →
                </Link>
              </div>

              <Link
                to={`/games/${inDev.id}`}
                className="mt-6 group grid gap-8 md:grid-cols-[3fr_2fr] items-center border-2 border-bronze/40 bg-ivory rounded-sm overflow-hidden hover:border-bronze transition-colors shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]"
              >
                <div className="aspect-video overflow-hidden bg-muted">
                  <img
                    src={inDev.image}
                    alt={inDev.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-6 md:p-8">
                  <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground group-hover:text-crimson transition-colors tracking-tight">
                    {inDev.title}
                  </h2>
                  <div className="mt-3 h-px w-16 bg-gradient-to-r from-bronze via-crimson to-transparent" />
                  {inDev.pitch && (
                    <p className="mt-4 text-sm md:text-base leading-relaxed text-muted-foreground line-clamp-5">
                      {inDev.pitch}
                    </p>
                  )}
                  <span className="mt-6 inline-block text-xs font-heading font-semibold uppercase tracking-wider text-crimson">
                    Enter Game →
                  </span>
                </div>
              </Link>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Index;
