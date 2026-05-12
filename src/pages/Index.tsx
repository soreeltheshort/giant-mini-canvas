import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import { games } from "@/games";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface LatestPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  published_at: string | null;
  created_at: string;
}

const Index = () => {
  const activeGame = games.find((g) => g.inDevelopment);
  const { user, isAdmin, isTester } = useAuth();
  const canAccessTesting = isAdmin || isTester;
  const [latestPost, setLatestPost] = useState<LatestPost | null>(null);
  const navigate = useNavigate();

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data } = await (supabase as any)
      .from("cutscenes")
      .select("id")
      .eq("name", "GameIntro")
      .maybeSingle();
    if (data?.id) {
      navigate(`/cutscenes/${data.id}/play?next=/new-game`);
    } else {
      navigate("/new-game");
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("blog_posts")
        .select("id, slug, title, excerpt, cover_image_url, published_at, created_at")
        .eq("published", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setLatestPost(data);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Currently in Development */}
      <section className="border-b-2 border-bronze/40 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(circle_at_30%_20%,hsl(var(--bronze))_0,transparent_60%),radial-gradient(circle_at_80%_80%,hsl(var(--crimson))_0,transparent_55%)]" />
        <div className="container py-20 relative">
          <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
            Senatus Populusque · Now in Development
          </p>
          {activeGame && (
            <div className="mt-8 grid gap-10 md:grid-cols-2 items-center">
              <div className="aspect-video overflow-hidden border-2 border-bronze/50 rounded-sm shadow-[0_8px_30px_-12px_hsl(var(--bronze)/0.4)]">
                <img src={activeGame.image} alt={activeGame.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                  {activeGame.title}
                </h1>
                <div className="mt-3 h-px w-24 bg-gradient-to-r from-bronze via-crimson to-transparent" />
                <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                  Forge alliances, command legions, and wage simultaneous-turn war across a hex-bound galaxy.
                  A tactical wargame of senate intrigue, ground invasions, and an encroaching alien threat.
                </p>

                {!user && (
                  <div className="mt-8 rounded-sm border-2 border-crimson/60 bg-gradient-to-br from-ivory to-ivory-dark p-5 shadow-[0_4px_20px_-6px_hsl(var(--crimson)/0.35)]">
                    <p className="font-heading text-xs font-semibold uppercase tracking-widest text-crimson">
                      Join the Republic
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a free commander account to follow development and earn early access to playtests.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link to="/signup">
                        <Button
                          size="lg"
                          className="bg-crimson text-primary-foreground hover:bg-crimson-light font-heading uppercase tracking-wider shadow-[0_4px_14px_-4px_hsl(var(--crimson)/0.6)]"
                        >
                          ⚔ Create Free Account
                        </Button>
                      </Link>
                      <Link to="/login" className="text-sm font-medium text-bronze-dark hover:text-foreground">
                        Already enlisted? Sign in →
                      </Link>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to="/new-game"
                    onClick={handlePlay}
                    className="inline-flex h-10 items-center border-2 border-bronze/60 bg-ivory px-6 font-heading font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-bronze hover:bg-ivory-dark text-slate-500 text-base"
                  >
                    Play →
                  </Link>
                  {activeGame.id === "third-republic" && canAccessTesting && (
                    <Link to="/dashboard">
                      <Button className="bg-gold text-secondary-foreground hover:bg-gold/90 font-heading uppercase tracking-wider">
                        ⚔ Combat Testing
                      </Button>
                    </Link>
                  )}
                </div>
                {activeGame.id === "third-republic" && canAccessTesting && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link to="/map-testing">
                      <Button size="sm" variant="outline" className="font-heading uppercase tracking-wider text-xs">🗺 Map Testing</Button>
                    </Link>
                    <Link to="/planet-testing">
                      <Button size="sm" variant="outline" className="font-heading uppercase tracking-wider text-xs">🌍 Planet Testing</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Latest Dispatch */}
      {latestPost && (
        <section className="border-b-2 border-bronze/40">
          <div className="container py-16">
            <div className="flex items-baseline justify-between flex-wrap gap-3">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
                Latest Dispatch
              </p>
              <Link to="/blog" className="text-xs font-heading font-semibold uppercase tracking-wider text-crimson hover:text-crimson-light">
                All Dispatches →
              </Link>
            </div>
            <Link
              to={`/blog/${latestPost.slug}`}
              className="mt-6 group grid gap-8 md:grid-cols-[2fr_3fr] items-center border-2 border-bronze/40 bg-ivory rounded-sm overflow-hidden hover:border-bronze transition-colors shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)]"
            >
              {latestPost.cover_image_url ? (
                <div className="aspect-video md:aspect-auto md:h-full overflow-hidden bg-muted">
                  <img
                    src={latestPost.cover_image_url}
                    alt={latestPost.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="aspect-video md:aspect-auto md:h-full bg-gradient-to-br from-ivory-dark via-ivory to-ivory-dark" />
              )}
              <div className="p-6 md:p-8">
                <p className="text-xs uppercase tracking-widest text-bronze-dark font-semibold">
                  {new Date(latestPost.published_at || latestPost.created_at).toLocaleDateString(undefined, {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
                <h2 className="mt-2 font-heading text-2xl md:text-3xl font-bold text-slate-500 group-hover:text-crimson transition-colors">
                  {latestPost.title}
                </h2>
                <div className="mt-3 h-px w-16 bg-gradient-to-r from-bronze to-transparent" />
                {latestPost.excerpt && (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground line-clamp-4">
                    {latestPost.excerpt}
                  </p>
                )}
                <span className="mt-5 inline-block text-xs font-heading font-semibold uppercase tracking-wider text-crimson">
                  Read Dispatch →
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Communications */}
      {!user && (
        <section id="newsletter">
          <div className="container py-20">
            <div className="max-w-lg">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">Communications</p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-foreground">Stop Receiving Dispatches</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Already on our list and want to unsubscribe? Enter your email and we'll remove you immediately.
              </p>
              <div className="mt-6">
                <Link to="/unsubscribe">
                  <Button variant="outline" className="font-heading uppercase tracking-wider">
                    Unsubscribe →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
};

export default Index;
