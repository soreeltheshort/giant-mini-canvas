import { Link } from "react-router-dom";
import Header from "@/components/Header";
import PageMeta from "@/components/PageMeta";
import { useAuth } from "@/hooks/useAuth";

const TITLE_BG =
  "https://komjfcrtwzxssugvsbyc.supabase.co/storage/v1/object/public/images/TitleScreenBackground.png";

export default function Credits() {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <PageMeta
        title="Credits — MiniGiantGames"
        description="Music, art, and tools that helped build the MiniGiantGames studio and the tactical space wargame Third Republic."
        path="/credits"
      />
      {isAdmin && <Header />}
      <main
        className="flex-1 relative bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${TITLE_BG})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center min-h-[calc(100vh-4rem)] px-4 py-16">
          <h1 className="font-heading uppercase tracking-[0.3em] text-4xl text-gold drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] mt-[8vh]">
            Credits
          </h1>

          <div className="mt-12 w-full max-w-2xl space-y-10 text-ivory">
            <section className="text-center">
              <h2 className="font-heading uppercase tracking-[0.25em] text-xl text-gold mb-4">
                Music
              </h2>
              <ul className="space-y-2 text-base">
                <li>Universfield</li>
                <li>Lowtone Music</li>
                <li>Alex-Productions</li>
              </ul>
              <p className="mt-4 text-sm text-bronze">
                Tracks courtesy of the{" "}
                <a
                  href="https://freemusicarchive.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold underline-offset-4 hover:underline"
                >
                  Free Music Archive
                </a>
                .
              </p>
            </section>
          </div>

          <Link
            to="/new-game"
            className="mt-16 font-heading uppercase tracking-[0.3em] text-sm text-bronze hover:text-gold transition-colors"
          >
            ← Return to Command Console
          </Link>
        </div>
      </main>
    </div>
  );
}
