import { useEffect, useState } from "react";
import { CameraFeed } from "./components/CameraFeed";
import { BoundingBoxCanvas } from "./components/BoundingBoxCanvas";
import OverlayLayer from "./components/OverlayLayer";
import { useCamera } from "./hooks/useCamera";
import { useYOLO } from "./hooks/useYOLO";
import { useTracking } from "./hooks/useTracking";
import { useEnrichment } from "./hooks/useEnrichment";
import { useStore } from "./store/useStore";

function App() {
  const { videoRef, stream, error, isReady, retryCamera } = useCamera();
  const { detections, isModelLoaded, error: yoloError, sampleCanvasRef, retryModelLoad } = useYOLO(videoRef);
  const trackedObjects = useTracking(detections);
  const setTrackedObjects = useStore((s) => s.setTrackedObjects);
  const { connectionStatus } = useEnrichment(sampleCanvasRef);

  const [videoDims, setVideoDims] = useState({ width: 1280, height: 720 });

  // Sync tracked objects into Zustand store each frame
  useEffect(() => {
    setTrackedObjects(trackedObjects);
  }, [trackedObjects, setTrackedObjects]);

  // Capture video intrinsic dimensions when metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleMetadata() {
      if (video) {
        setVideoDims({ width: video.videoWidth, height: video.videoHeight });
      }
    }

    video.addEventListener("loadedmetadata", handleMetadata);
    return () => video.removeEventListener("loadedmetadata", handleMetadata);
  }, [videoRef, isReady]);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative">
      {/* Layer 1: Camera feed */}
      <CameraFeed videoRef={videoRef} stream={stream} error={error} isReady={isReady} onRetry={retryCamera} />

      {/* Layer 2: Bounding box canvas */}
      {isModelLoaded && (
        <BoundingBoxCanvas
          detections={detections}
          videoWidth={videoDims.width}
          videoHeight={videoDims.height}
        />
      )}

      {/* Layer 3: Overlay pills */}
      <OverlayLayer />

      {/* YOLO model error banner */}
      {yoloError && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-900/80 text-white text-xs font-mono px-4 py-2 text-center flex items-center justify-center gap-3">
          <span>{yoloError}</span>
          <button
            onClick={retryModelLoad}
            className="px-2 py-0.5 border border-white/40 rounded bg-white/10 hover:bg-white/20 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* WebSocket connection status indicator */}
      <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2">
        {connectionStatus === "reconnecting" && (
          <span className="text-yellow-400 text-xs font-mono">
            Reconnecting...
          </span>
        )}
        <div
          className={`w-2 h-2 rounded-full ${
            connectionStatus === "connected"
              ? "bg-green-500"
              : connectionStatus === "reconnecting"
                ? "bg-yellow-500"
                : "bg-red-500"
          }`}
        />
      </div>
    </div>
  );
}

export default App;
