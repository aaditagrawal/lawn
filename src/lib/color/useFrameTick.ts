import { useEffect, useState } from "react";

/**
 * A counter that bumps whenever the video shows a different picture: seeks,
 * pauses, new data, dimension changes and — when `live` — every presented
 * frame while playing, throttled to `maxFps`.
 */
export function useFrameTick(video: HTMLVideoElement | null, live: boolean, maxFps = 30) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!video) return;
    const bump = () => setTick((current) => current + 1);
    const events = ["seeked", "pause", "loadeddata", "resize", "play", "timeupdate"] as const;
    // timeupdate only matters while paused (frame steps); playing frames come
    // from the frame callback below.
    const handleTimeUpdate = () => {
      if (video.paused) bump();
    };
    for (const event of events) {
      video.addEventListener(event, event === "timeupdate" ? handleTimeUpdate : bump);
    }

    let frameHandle: number | null = null;
    let rafHandle: number | null = null;
    let lastTick = 0;
    const minInterval = 1000 / maxFps;
    const onFrame = () => {
      const now = performance.now();
      if (now - lastTick >= minInterval) {
        lastTick = now;
        bump();
      }
      schedule();
    };
    const schedule = () => {
      if (!live) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        frameHandle = video.requestVideoFrameCallback(onFrame);
      } else {
        rafHandle = window.requestAnimationFrame(() => {
          if (!video.paused) onFrame();
          else schedule();
        });
      }
    };
    schedule();

    return () => {
      for (const event of events) {
        video.removeEventListener(event, event === "timeupdate" ? handleTimeUpdate : bump);
      }
      if (frameHandle !== null) video.cancelVideoFrameCallback(frameHandle);
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
    };
  }, [live, maxFps, video]);

  return tick;
}
