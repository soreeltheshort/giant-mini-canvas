import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";

const TITLE_BG =
  "https://komjfcrtwzxssugvsbyc.supabase.co/storage/v1/object/public/images/TitleScreenBackground.png";

interface MenuItem {
  label: string;
  sub?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function NewGameMenu() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const items: MenuItem[] = [
    { label: "Continue", to: "/my-games" },
    { label: "New Campaign", disabled: true },
    { label: "Load Game", to: "/my-games" },
    { label: "Senate Chronicles", to: "/blog" },
    { label: "Options", disabled: true },
    { label: "Credits", disabled: true },
    { label: "Exit", onClick: () => navigate("/") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {isAdmin && <Header />}

      <main
        className="flex-1 relative bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${TITLE_BG})` }}
      >
        {/* Subtle vignette so menu reads on busy art */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/60 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-10">
          {/* Menu plates */}
          <nav className="flex flex-col gap-3 w-full max-w-md mt-[16vh]">
            {items.map((item) => {
              const content = (
                <div
                  className={`group relative w-full text-center px-8 py-3
                    border border-bronze/60
                    bg-gradient-to-b from-black/70 via-black/60 to-black/80
                    shadow-[inset_0_1px_0_hsl(var(--bronze)/0.35),0_4px_18px_-6px_rgba(0,0,0,0.8)]
                    backdrop-blur-[2px]
                    transition-all
                    ${item.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:border-gold hover:from-black/80 hover:to-black/90 hover:shadow-[inset_0_1px_0_hsl(var(--gold)/0.5),0_6px_24px_-6px_hsl(var(--gold)/0.35)] cursor-pointer"
                    }`}
                  style={{
                    clipPath:
                      "polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)",
                  }}
                >
                  <div className="font-heading uppercase tracking-[0.25em] text-xl text-gold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                    {item.label}
                  </div>
                  {item.sub && (
                    <div className="font-heading text-[11px] uppercase tracking-[0.3em] text-bronze mt-0.5">
                      {item.sub}
                    </div>
                  )}
                </div>
              );

              if (item.disabled) return <div key={item.label}>{content}</div>;
              if (item.to)
                return (
                  <Link key={item.label} to={item.to}>
                    {content}
                  </Link>
                );
              return (
                <button key={item.label} onClick={item.onClick} className="w-full">
                  {content}
                </button>
              );
            })}
          </nav>
        </div>
      </main>
    </div>
  );
}
