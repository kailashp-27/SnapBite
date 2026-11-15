import {useEffect, useRef, useState} from 'react';
import {Camera, FlipHorizontal, ImagePlus, RefreshCw, X, Zap, ZapOff, AlertCircle} from 'lucide-react';

interface CameraViewfinderProps {
  title?: string;
  onCapture: (file: File) => void;
  onClose: () => void;
  onPickGallery?: () => void;
}

export default function CameraViewfinder({
  title = 'Take Food Photo',
  onCapture,
  onClose,
  onPickGallery,
}: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    startStream(facingMode);

    return () => {
      stopStream();
    };
  }, [facingMode]);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          /* ignore track stop failure */
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startStream(mode: 'environment' | 'user') {
    stopStream();
    setStarting(true);
    setError(null);
    setTorchOn(false);
    setTorchSupported(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Live camera is not supported in this browser. You can still use the system camera below.');
      setStarting(false);
      return;
    }

    try {
      // First try exact facingMode for back camera, fallback to ideal
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: mode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        });
      }

      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) {
        // Check for torch capability
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        if (capabilities.torch) {
          setTorchSupported(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Auto-play could be blocked if unmuted
          videoRef.current.muted = true;
          await videoRef.current.play();
        }
      }
      setStarting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Permission') || message.includes('denied') || message.includes('NotAllowedError')) {
        setError('Camera permission was denied. Please allow camera access in browser settings or use the system picker.');
      } else {
        setError('Could not access back camera. Tap below to use system camera.');
      }
      setStarting(false);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      // Torch constraint failed
    }
  }

  function toggleCamera() {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  }

  function snapPhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    // Visual flash
    setFlash(true);
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(30);
      } catch {
        /* ignore */
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, flip horizontally for mirror correction
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      blob => {
        setFlash(false);
        if (!blob) return;
        const file = new File([blob], `snapbite-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        stopStream();
        onCapture(file);
      },
      'image/jpeg',
      0.92
    );
  }

  function handleFallbackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      stopStream();
      onCapture(file);
    }
    e.target.value = '';
  }

  return (
    <div className="camera-viewfinder-overlay" role="dialog" aria-modal="true" aria-label={title}>
      {flash && <div className="camera-flash-effect" />}

      <header className="camera-viewfinder-header">
        <button
          type="button"
          className="camera-viewfinder-btn close-btn"
          aria-label="Close camera"
          onClick={() => {
            stopStream();
            onClose();
          }}
        >
          <X size={22} />
        </button>

        <span className="camera-viewfinder-title">{title}</span>

        <div className="camera-header-actions">
          {torchSupported && (
            <button
              type="button"
              className={`camera-viewfinder-btn ${torchOn ? 'active' : ''}`}
              aria-label={torchOn ? 'Turn off flash' : 'Turn on flash'}
              onClick={toggleTorch}
            >
              {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
            </button>
          )}

          <button
            type="button"
            className="camera-viewfinder-btn"
            aria-label="Switch camera (front/back)"
            onClick={toggleCamera}
          >
            <FlipHorizontal size={20} />
          </button>
        </div>
      </header>

      <div className="camera-viewfinder-stage">
        {error ? (
          <div className="camera-viewfinder-error">
            <AlertCircle size={42} />
            <p>{error}</p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: '16px' }}
              onClick={() => fileFallbackRef.current?.click()}
            >
              <Camera size={18} /> Open System Camera
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`camera-video-stream ${facingMode === 'user' ? 'mirrored' : ''}`}
            />
            {starting && (
              <div className="camera-starting-loader">
                <RefreshCw className="spin" size={32} />
                <span>Starting back camera…</span>
              </div>
            )}
            <div className="camera-reticle" aria-hidden="true">
              <div className="reticle-corner top-left" />
              <div className="reticle-corner top-right" />
              <div className="reticle-corner bottom-left" />
              <div className="reticle-corner bottom-right" />
              <div className="reticle-hint">Center dish on plate</div>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileFallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFallbackFile}
      />

      <footer className="camera-viewfinder-footer">
        <div className="camera-footer-left">
          {onPickGallery && (
            <button
              type="button"
              className="camera-secondary-action"
              aria-label="Pick photo from gallery"
              onClick={() => {
                stopStream();
                onPickGallery();
              }}
            >
              <ImagePlus size={22} />
              <span>Gallery</span>
            </button>
          )}
        </div>

        <div className="camera-footer-center">
          <button
            type="button"
            className="camera-shutter-button"
            disabled={starting || !!error}
            aria-label="Take photo"
            onClick={snapPhoto}
          >
            <div className="shutter-inner" />
          </button>
        </div>

        <div className="camera-footer-right">
          <button
            type="button"
            className="camera-secondary-action"
            aria-label="Use native camera"
            onClick={() => fileFallbackRef.current?.click()}
          >
            <Camera size={20} />
            <span>Native</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
