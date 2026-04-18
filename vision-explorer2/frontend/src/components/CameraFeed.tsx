import { useEffect } from "react";
import type { RefObject } from "react";

interface CameraFeedProps {
  videoRef: RefObject<HTMLVideoElement>;
  stream: MediaStream | null;
  error: string | null;
  isReady: boolean;
  onRetry?: () => void;
}

export function CameraFeed({ videoRef, stream, error, isReady, onRetry }: CameraFeedProps) {
  useEffect(() => {
    if (videoRef.current && stream && isReady) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isReady, videoRef]);

  if (error) {
    return (
      <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-10 gap-4">
        <p className="text-white text-center px-8 text-sm font-mono">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm font-mono text-white border border-white/40 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 w-full h-full object-cover z-10"
    />
  );
}
