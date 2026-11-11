/**
 * Tải YouTube IFrame Player API chính thức (https://www.youtube.com/iframe_api) một lần, chỉ khi khách bấm xem video.
 * Dùng để điều khiển iframe nhúng có sẵn (enablejsapi=1): phát, tạm dừng (giữ vị trí), tắt tiếng.
 * Tài liệu: https://developers.google.com/youtube/iframe_api_reference
 */

export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  getPlayerState(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLIFrameElement,
    opts: { events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void } },
  ) => YTPlayer;
};

/** Trạng thái trình phát YouTube (theo tài liệu). */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

type YTWindow = Window & { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player && w.YT.loaded) return Promise.resolve(w.YT);
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT?.Player) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      loading = null; // cho phép thử lại lần sau
      reject(new Error("Không tải được YouTube Player API"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
