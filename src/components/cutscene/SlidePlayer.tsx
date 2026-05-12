import { useEffect, useState } from "react";

export interface SlideLike {
  image_url: string | null;
  text: string;
  fade_in_ms: number;
  hold_ms: number;
  fade_out_ms: number;
  word_speed_ms: number;
}

interface Props {
  slide: SlideLike;
  onComplete: () => void;
}

/**
 * Plays a single cutscene slide:
 *  - image fades in, holds while text reveals word-by-word, then fades out
 *  - hold duration begins after fade-in completes; total visible time is fade_in + hold + fade_out
 *  - calls onComplete when fade-out finishes
 */
export default function SlidePlayer({ slide, onComplete }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [wordCount, setWordCount] = useState(0);

  const words = slide.text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    setPhase("in");
    setWordCount(0);
    const t1 = setTimeout(() => setPhase("hold"), slide.fade_in_ms);
    const t2 = setTimeout(() => setPhase("out"), slide.fade_in_ms + slide.hold_ms);
    const t3 = setTimeout(() => onComplete(), slide.fade_in_ms + slide.hold_ms + slide.fade_out_ms);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  // Word-by-word reveal — starts when image begins fading in
  useEffect(() => {
    if (phase === "out") return;
    if (wordCount >= words.length) return;
    const t = setTimeout(() => setWordCount((c) => c + 1), slide.word_speed_ms);
    return () => clearTimeout(t);
  }, [wordCount, phase, words.length, slide.word_speed_ms]);

  const opacity = phase === "in" ? 1 : phase === "hold" ? 1 : 0;
  const transitionMs = phase === "in" ? slide.fade_in_ms : phase === "out" ? slide.fade_out_ms : 0;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {slide.image_url && (
        <img
          src={slide.image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity,
            transition: `opacity ${transitionMs}ms ease-in-out`,
            // start invisible before first paint
            ...(phase === "in" && wordCount === 0 ? { opacity: 0 } : {}),
          }}
          onLoad={(e) => {
            // trigger fade-in
            (e.target as HTMLImageElement).style.opacity = "1";
          }}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 p-8 md:p-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent"
        style={{ opacity, transition: `opacity ${transitionMs}ms ease-in-out` }}
      >
        <p className="font-heading text-xl md:text-3xl text-ivory leading-relaxed max-w-4xl mx-auto text-center">
          {words.slice(0, wordCount).join(" ")}
          <span className="opacity-0">{words.slice(wordCount).join(" ")}</span>
        </p>
      </div>
    </div>
  );
}
