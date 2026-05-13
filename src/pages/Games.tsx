import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GameCard from "@/components/GameCard";
import PageMeta from "@/components/PageMeta";
import { games } from "@/games";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const Games = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handlePlay = async () => {
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

  return (
    <div className="min-h-screen bg-background">
      <PageMeta
        title="Games — MiniGiantGames"
        description="Browse strategy and simulation games in development at MiniGiantGames, including Third Republic, our tactical space wargame."
        path="/games"
      />
      <Header />
      <main>
        <section>
          <div className="container py-20">
            <h1 className="font-heading text-3xl font-bold text-foreground">Games</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Strategy and simulation titles currently in development.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <div key={game.id} className="flex flex-col">
                  <GameCard
                    id={game.id}
                    title={game.title}
                    description={game.description}
                    image={game.image}
                  />
                  {game.id === "third-republic" && user && (
                    <button
                      onClick={handlePlay}
                      className="mt-3 inline-flex items-center justify-center rounded-sm border border-bronze bg-crimson px-4 py-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-crimson-light"
                    >
                      Play
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Games;
