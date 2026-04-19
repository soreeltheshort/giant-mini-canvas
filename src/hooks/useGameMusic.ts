import { useEffect } from "react";
import musicUrl from "@/assets/saturn-powerplant-loop.ogg";

/**
 * Plays the in-game ambient music on a loop at low volume.
 * Browsers may block autoplay until first user gesture — we retry
 * on the first pointerdown/keydown to recover gracefully.
 */
export function useGameMusic(enabled: boolean = true, volume: number = 0.15) {
  useEffect(() => {
    if (!enabled) return;
    const audio = new Audio(musicUrl);
    audio.loop = true;
    audio.volume = volume;
    audio.preload = "auto";

    let cancelled = false;

    const tryPlay = () => {
      if (cancelled) return;
      audio.play().catch(() => {
        // Autoplay blocked — wait for first user gesture
      });
    };

    tryPlay();

    const onGesture = () => {
      tryPlay();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      audio.pause();
      audio.src = "";
    };
  }, [enabled, volume]);
}
