import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import SlidePlayer, { SlideLike } from "@/components/cutscene/SlidePlayer";
import { Button } from "@/components/ui/button";

interface Slide extends SlideLike {
  id: string;
  order_index: number;
}

export default function CutscenePlayer() {
  const { id } = useParams<{ id: string }>();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/";

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data } = await (supabase as any)
        .from("cutscene_slides")
        .select("id, order_index, image_url, text, text_2, text_3, fade_in_ms, hold_ms, fade_out_ms, word_speed_ms, slug_delay_ms")
        .eq("cutscene_id", id)
        .order("order_index");
      setSlides(data || []);
      setLoading(false);
    })();
  }, [id]);

  const skip = () => navigate(next);

  if (loading) return <div className="min-h-screen bg-black" />;
  if (slides.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-ivory">
        <div className="text-center">
          <p>No slides in this cutscene.</p>
          <Button className="mt-4" onClick={skip}>Continue →</Button>
        </div>
      </div>
    );
  }

  const current = slides[idx];

  return (
    <div className="fixed inset-0 bg-black z-50">
      <SlidePlayer
        key={current.id}
        slide={current}
        onComplete={() => {
          if (idx < slides.length - 1) {
            setIdx(idx + 1);
          } else if (!done) {
            setDone(true);
            navigate(next);
          }
        }}
      />
      <button
        onClick={skip}
        className="absolute top-4 right-4 text-xs font-heading uppercase tracking-wider text-ivory/70 hover:text-ivory border border-ivory/30 hover:border-ivory/60 px-3 py-1.5 rounded-sm bg-black/40 backdrop-blur"
      >
        Skip →
      </button>
    </div>
  );
}
