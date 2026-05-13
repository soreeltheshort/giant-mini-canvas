import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import PageMeta from "@/components/PageMeta";
import { games } from "@/games";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
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

const GameDetail = () => {
  const { id } = useParams<{ id: string }>();
  const game = games.find((g) => g.id === id);
  const { user, isAdmin, isTester } = useAuth();
  const canAccessTesting = isAdmin || isTester;
  const navigate = useNavigate();
  const [latestPost, setLatestPost] = useState<LatestPost | null>(null);

  const isThirdRepublic = game?.id === "third-republic";

  useEffect(() => {
    if (!isThirdRepublic) return;
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
  }, [isThirdRepublic]);

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

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title={`${game.title} — MiniGiantGames`}
        description={(game.pitch || game.description || "").slice(0, 160)}
        path={`/games/${game.id}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "VideoGame",
          name: game.title,
          description: game.pitch || game.description,
          applicationCategory: "Game",
          operatingSystem: (game.platforms || []).join(", ") || "Web",
          publisher: { "@type": "Organization", name: "MiniGiantGames" },
        }}
      />
      <Header />
      <main>

      {/* Currently in Development hero (TR only) */}
      {isThirdRepublic ? (
        <section className="border-b-2 border-bronze/40 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(circle_at_30%_20%,hsl(var(--bronze))_0,transparent_60%),radial-gradient(circle_at_80%_80%,hsl(var(--crimson))_0,transparent_55%)]" />
          <div className="container py-20 relative">
            <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              ← Mini Giant Games
            </Link>
            <p className="mt-6 text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">
              Senatus Populusque · Now in Development
            </p>
            <div className="mt-8 grid gap-10 md:grid-cols-2 items-center">
              <div className="aspect-video overflow-hidden border-2 border-bronze/50 rounded-sm shadow-[0_8px_30px_-12px_hsl(var(--bronze)/0.4)]">
                <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="font-heading text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                  {game.title}
                </h1>
                <div className="mt-3 h-px w-24 bg-gradient-to-r from-bronze via-crimson to-transparent" />
                <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                  {game.pitch}
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
                  {canAccessTesting && (
                    <Link to="/dashboard">
                      <Button className="bg-gold text-secondary-foreground hover:bg-gold/90 font-heading uppercase tracking-wider">
                        ⚔ Combat Testing
                      </Button>
                    </Link>
                  )}
                </div>
                {canAccessTesting && (
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
          </div>
        </section>
      ) : (
        <div className="aspect-[21/9] w-full overflow-hidden border-b border-border">
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="container py-16">
        {!isThirdRepublic && (
          <Link to="/games" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Back to Games
          </Link>
        )}

        <div className={`${isThirdRepublic ? "" : "mt-8"} max-w-2xl`}>
          {!isThirdRepublic && (
            <>
              <h1 className="font-heading text-3xl font-bold text-foreground">{game.title}</h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">{game.pitch}</p>
            </>
          )}

          {/* Platforms */}
          <div className="mt-2 flex gap-2">
            {game.platforms.map((p) => (
              <span key={p} className="border border-border px-3 py-1 text-xs text-muted-foreground">
                {p}
              </span>
            ))}
          </div>

          {/* Features */}
          <div className="mt-10">
            <h2 className="font-heading text-lg font-semibold text-accent">Features</h2>
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
            <h2 className="font-heading text-lg font-semibold text-accent">Development Updates</h2>
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
        </div>

        {/* Latest Dispatch (TR only) */}
        {isThirdRepublic && latestPost && (
          <section className="mt-16 border-t-2 border-bronze/40 pt-10">
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
              className="mt-6 group grid gap-8 md:grid-cols-[2fr_3fr] items-center border-2 border-bronze/40 bg-ivory rounded-sm overflow-hidden hover:border-bronze transition-colors shadow-[0_4px_20px_-8px_hsl(var(--bronze)/0.35)] bg-slate-950"
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
          </section>
        )}

        {/* Newsletter / Communications */}
        <div className="mt-16 max-w-2xl">
          {isThirdRepublic && !user ? (
            <section id="newsletter" className="border-t-2 border-bronze/40 pt-10">
              <p className="text-xs font-heading font-semibold uppercase tracking-[0.3em] text-bronze-dark">Communications</p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-foreground">Receive Dispatches</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Get every new devlog post delivered by email. Unsubscribe anytime.
              </p>
              <SubscribeForm />
              <p className="mt-6 text-xs text-muted-foreground">
                Already on our list?{" "}
                <Link to="/unsubscribe" className="underline hover:text-foreground">
                  Unsubscribe here
                </Link>.
              </p>
            </section>
          ) : (
            <div className="border-t border-border pt-10">
              <h2 className="font-heading text-lg font-semibold text-accent">Follow Development</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Get notified about {game.title} updates and release information.
              </p>
              <div className="mt-6">
                <Newsletter />
              </div>
            </div>
          )}
        </div>
      </div>

      </main>
      <Footer />
    </div>
  );
};

function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any)
      .from("newsletter_subscribers")
      .insert({ email: trimmed, source: "third-republic" });
    setSubmitting(false);
    if (error && !/duplicate key/i.test(error.message)) {
      toast({ title: "Could not subscribe", description: error.message, variant: "destructive" });
      return;
    }
    setEmail("");
    toast({ title: "Subscribed", description: "You're on the dispatch list." });
  };

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md">
      <Input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-ivory"
      />
      <Button type="submit" disabled={submitting} className="font-heading uppercase tracking-wider">
        {submitting ? "Subscribing…" : "Subscribe →"}
      </Button>
    </form>
  );
}

export default GameDetail;
