import React, { useEffect, useRef, useCallback } from "react";

export interface IframeAdBlockPlayerProps {
  src: string;
  server: string;
  language?: string;
  episodeNum: number;
  episodeTitle: string;
  animeId: string | number;
  animeTitle: string;
  animeCover: string;
  episodeThumbnail?: string;
  isAdult?: boolean;
  onEnded?: () => void;
  onNextEp?: () => void;
  onPrevEp?: () => void;
  autoNext?: boolean;
  onProgress?: (currentTime: number, duration: number) => void;
}

export function IframeAdBlockPlayer({
  src,
  server,
  language,
  episodeNum,
  episodeTitle,
  animeId,
  animeTitle,
  animeCover,
  episodeThumbnail,
  isAdult,
  onEnded,
  onNextEp,
  onPrevEp,
  autoNext = true,
  onProgress,
}: IframeAdBlockPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastEventTimeRef = useRef<number>(0);
  const hasTriggeredNextRef = useRef<boolean>(false);

  // Reset next trigger flag on episode or src change
  useEffect(() => {
    hasTriggeredNextRef.current = false;
  }, [src, episodeNum]);

  // When episode changes or player mounts, update continue watching with 0s timestamp as fallback
  useEffect(() => {
    try {
      const listRaw = localStorage.getItem("continue_watching_list");
      let list: any[] = listRaw ? JSON.parse(listRaw) : [];
      list = list.filter((item: any) => String(item.animeId) !== String(animeId));

      list.unshift({
        animeId,
        animeTitle,
        animeCover,
        episodeThumbnail: episodeThumbnail || animeCover,
        episodeNum,
        episodeTitle,
        currentTime: 0,
        duration: 0,
        updatedAt: Date.now(),
        isAdult: !!isAdult,
      });

      if (list.length > 20) {
        list = list.slice(0, 20);
      }

      localStorage.setItem("continue_watching_list", JSON.stringify(list));
      window.dispatchEvent(new Event("anikume_continue_update"));
      if (onProgress) onProgress(0, 0);
    } catch (e) {
      console.error("Error updating continue watching for iframe stream:", e);
    }
  }, [animeId, episodeNum, animeTitle, animeCover, episodeThumbnail, isAdult, onProgress]);

  // Handle next episode transition safely
  const triggerNextEpisode = useCallback(() => {
    if (hasTriggeredNextRef.current) return;
    hasTriggeredNextRef.current = true;

    if (onEnded) {
      onEnded();
    } else if (onNextEp) {
      onNextEp();
    }
  }, [onEnded, onNextEp]);

  // Listen for iframe postMessages (PlayerJS, JWPlayer, Plyr, VideoJS, MegaVid, etc.)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch {
            // Check plain text events
            const strData = data.toLowerCase();
            if (
              strData === "ended" ||
              strData === "finish" ||
              strData === "complete" ||
              strData.includes("video_ended") ||
              strData.includes("playback_ended")
            ) {
              if (autoNext) triggerNextEpisode();
              return;
            }
          }
        }

        if (!data || typeof data !== "object") return;

        // PlayerJS, JWPlayer, Plyr, VideoJS event normalization
        const eventType = (
          data.event ||
          data.type ||
          data.action ||
          data.status ||
          data.msg ||
          data.name ||
          ""
        ).toString().toLowerCase();

        const currentTime =
          typeof data.time === "number"
            ? data.time
            : typeof data.currentTime === "number"
              ? data.currentTime
              : typeof data.position === "number"
                ? data.position
                : 0;

        const duration =
          typeof data.duration === "number"
            ? data.duration
            : typeof data.total === "number"
              ? data.total
              : 0;

        // Check for playback finished / ended events
        const isEnded =
          eventType === "ended" ||
          eventType === "finish" ||
          eventType === "complete" ||
          eventType === "video_ended" ||
          eventType === "playerjs:ended" ||
          eventType === "jwplayer:complete" ||
          eventType === "plyr:ended" ||
          (duration > 60 && currentTime > 0 && currentTime >= duration - 2);

        if (isEnded) {
          if (autoNext) triggerNextEpisode();
        }

        if (currentTime > 0) {
          lastEventTimeRef.current = currentTime;
          if (onProgress) onProgress(currentTime, duration);
          try {
            localStorage.setItem(`progress_${animeId}_ep_${episodeNum}`, currentTime.toString());
          } catch {}
        }
      } catch {
        // Ignore cross-origin non-JSON messages
      }
    };

    window.addEventListener("message", handleMessage);

    // Handshake interval to subscribe to player events for PlayerJS / JWPlayer embeds
    const handshakeInterval = setInterval(() => {
      if (iframeRef.current?.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage('{"action":"listen"}', "*");
          iframeRef.current.contentWindow.postMessage('{"api":"addEventListener","event":"ended"}', "*");
          iframeRef.current.contentWindow.postMessage('{"event":"listen"}', "*");
        } catch {}
      }
    }, 3000);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearInterval(handshakeInterval);
    };
  }, [animeId, episodeNum, autoNext, triggerNextEpisode, onProgress]);

  // Prevent double tap / double click from triggering fullscreen on iframe or wrapper
  const handlePreventDoubleTapFullscreen = (e: React.MouseEvent | React.TouchEvent) => {
    // Stop double click / double tap propagation that might trigger browser or parent full screen
    if ("detail" in e && (e as React.MouseEvent).detail > 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handlePreventDoubleTapFullscreen}
      className="relative w-full aspect-video rounded-xl bg-black overflow-hidden select-none"
    >
      {/* Clean Iframe */}
      <iframe
        ref={iframeRef}
        src={src}
        className="w-full h-full border-0 bg-black"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        referrerPolicy="origin"
      />

      {/* Invisible Interactive Action Button at the exact location (bottom right above controls) */}
      {onNextEp && (
        <button
          type="button"
          id="invisible-next-ep-trigger"
          onClick={(e) => {
            e.stopPropagation();
            onNextEp();
          }}
          aria-label="Next Episode Trigger"
          className="absolute bottom-16 sm:bottom-20 right-4 sm:right-6 z-40 w-28 h-10 opacity-0 cursor-pointer pointer-events-auto select-none"
          title="Next Episode"
        />
      )}
    </div>
  );
}
