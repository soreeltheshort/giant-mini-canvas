import { useEffect, useState } from "react";

export interface SlideLike {
  image_url: string | null;
  text: string;
  text_2?: string;
  text_3?: string;
  fade_in_ms: number;
  hold_ms: number;
  fade_out_ms: number;
  word_speed_ms: number;
  slug_delay_ms?: number;
}

interface Props {
  slide: SlideLike;
  onComplete: () => void;
}

/**
 * Plays a single cutscene slide:
 *  - image fades in, holds while up to three text slugs reveal one-by-one
 *    (word-by-word within each, with a configurable delay between slugs),
 *    then fades out
 *  - calls onComplete when fade-out finishes
 */
export default function SlidePlayer({ slide, onComplete }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [slugIdx, setSlugIdx] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  const slugs = [slide.text, slide.text_2 || "", slide.text_3 || ""].filter((s) => s.trim().length > 0);
  const currentWords = (slugs[slugIdx] || "").split(/\s+/).filter(Boolean);
  const slugDelay = slide.slug_delay_ms ?? 600;

  useEffect(() => {
    setPhase("in");
    setSlugIdx(0);
    setWordCount(0);
    let fired = false;
    const t1 = setTimeout(() => setPhase("hold"), slide.fade_in_ms);
    const t2 = setTimeout(() => setPhase("out"), slide.fade_in_ms + slide.hold_ms);
    const t3 = setTimeout(() => {
      if (fired) return;
      fired = true;
      onComplete();
    }, slide.fade_in_ms + slide.hold_ms + slide.fade_out_ms);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  // Word-by-word reveal within the current slug
  useEffect(() => {
    if (phase === "out") return;
    if (wordCount < currentWords.length) {
      const t = setTimeout(() => setWordCount((c) => c + 1), slide.word_speed_ms);
      return () => clearTimeout(t);
    }
    // Slug fully shown — schedule advance to next slug
    if (slugIdx < slugs.length - 1) {
      const t = setTimeout(() => {
        setSlugIdx((i) => i + 1);
        setWordCount(0);
      }, slugDelay);
      return () => clearTimeout(t);
    }
  }, [wordCount, phase, currentWords.length, slide.word_speed_ms, slugIdx, slugs.length, slugDelay]);

  const opacity = phase === "out" ? 0 : 1;
  const transitionMs = phase === "in" ? slide.fade_in_ms : phase === "out" ? slide.fade_out_ms : 0;

  const handleAdvance = () => {
    if (phase === "out") return;
    if (wordCount < currentWords.length) {
      setWordCount(currentWords.length);
      return;
    }
    if (slugIdx < slugs.length - 1) {
      setSlugIdx((i) => i + 1);
      setWordCount(0);
    } else {
      setPhase("out");
    }
  };

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden cursor-pointer select-none"
      onClick={handleAdvance}
      onTouchStart={handleAdvance}
    >
      {slide.image_url && (
        <img
          src={slide.image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity, transition: `opacity ${transitionMs}ms ease-in-out` }}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 p-8 md:p-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
        style={{ opacity, transition: `opacity ${transitionMs}ms ease-in-out` }}
      >
        <div className="max-w-4xl mx-auto">
          <p className="font-heading text-xl md:text-3xl leading-relaxed text-center min-h-[2.5em]">
            {currentWords.map((w, wIdx) => {
              if (w === "|") return <br key={wIdx} />;
              return (
                <span
                  key={wIdx}
                  className={wIdx < wordCount ? "text-ivory" : "text-transparent"}
                >
                  {w}
                  {wIdx < currentWords.length - 1 ? " " : ""}
                </span>
              );
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
