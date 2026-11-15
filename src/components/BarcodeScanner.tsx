import {useEffect, useRef, useState} from 'react';
import {Camera, CircleHelp, ImagePlus, LoaderCircle, Plus, ScanBarcode, Search, ShieldCheck, X} from 'lucide-react';
import {db} from '../db';
import type {Food} from '../types';

interface BarcodeScannerProps {
  onPick: (query: string, food?: Food, candidates?: Food[]) => void;
  notify: (text: string) => void;
}

export default function BarcodeScanner({onPick, notify}: BarcodeScannerProps) {
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const hasBarcodeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  async function startCamera() {
    stopCamera();
    setStatusMessage('');
    setNotFoundCode(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      if (hasBarcodeDetector) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
        });

        const scanFrame = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            animationFrameRef.current = requestAnimationFrame(scanFrame);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const code = barcodes[0].rawValue.trim();
              if (code) {
                stopCamera();
                try {
                  navigator.vibrate?.(100);
                } catch {
                  // Ignore vibration errors
                }
                void lookupBarcode(code);
                return;
              }
            }
          } catch {
            // Detector frame error, continue scanning
          }
          animationFrameRef.current = requestAnimationFrame(scanFrame);
        };
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      } else {
        setStatusMessage('Live camera scanning requires Chrome/Edge or an image upload.');
      }
    } catch {
      setScanning(false);
      setStatusMessage('Camera access not granted or unavailable. You can enter the barcode number below.');
    }
  }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file.');
      return;
    }
    setBusy(true);
    setStatusMessage('');
    setNotFoundCode(null);
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.src = url;
      await img.decode();
      URL.revokeObjectURL(url);

      if (hasBarcodeDetector) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
        });
        const barcodes = await detector.detect(img);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          const code = barcodes[0].rawValue.trim();
          void lookupBarcode(code);
          return;
        }
        setStatusMessage('No barcode detected in this photo. Try manual entry.');
      } else {
        setStatusMessage('Barcode detection from photos is not supported in this browser. Enter the number below.');
      }
    } catch {
      setStatusMessage('Could not process this image.');
    } finally {
      setBusy(false);
    }
  }

  async function lookupBarcode(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    setBusy(true);
    setStatusMessage('');
    setNotFoundCode(null);

    try {
      // 1. Check local IndexedDB library first
      const localMatches = await db.foodLibrary
        .filter(f => f.id === code || f.id === `off:${code}` || (f.aliases?.includes(code) ?? false) || (f.aliases?.includes(`barcode:${code}`) ?? false))
        .toArray();

      if (localMatches.length > 0) {
        const found = localMatches[0];
        notify(`Found in local library: ${found.name}`);
        onPick(found.name, found);
        return;
      }

      // 2. If online, query Open Food Facts API
      if (navigator.onLine) {
        setStatusMessage('Checking Open Food Facts database…');
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 1 && data.product) {
            const p = data.product;
            const name = (p.product_name || p.generic_name || 'Packaged item').trim();
            const brand = (p.brands || '').trim();
            const serving = (p.serving_size || '100 g').trim();
            const grams = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100;
            const nutriments = p.nutriments || {};
            const calories = Math.round(Number(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal_serving'] ?? nutriments['energy-kcal'] ?? 0));
            const protein = Math.round(Number(nutriments['proteins_100g'] ?? 0) * 10) / 10;
            const carbs = Math.round(Number(nutriments['carbohydrates_100g'] ?? 0) * 10) / 10;
            const fat = Math.round(Number(nutriments['fat_100g'] ?? 0) * 10) / 10;

            const newFood: Food = {
              id: `off:${code}`,
              name: brand ? `${name} (${brand})` : name,
              category: 'Snacks',
              serving,
              grams,
              calories,
              protein,
              carbs,
              fat,
              emoji: '📦',
              aliases: [code, `barcode:${code}`, brand].filter(Boolean),
              source: `Open Food Facts (${brand ? `${brand} · ` : ''}Barcode ${code})`
            };

            await db.foodLibrary.put(newFood);
            notify(`Added ${newFood.name} to your local library`);
            onPick(newFood.name, newFood);
            return;
          }
        }
      }

      // 3. Not found or offline
      setNotFoundCode(code);
      setStatusMessage(`Barcode "${code}" was not found ${navigator.onLine ? 'in Open Food Facts' : '(offline)'}.`);
    } catch {
      setStatusMessage('Lookup failed. Check your network or enter nutrition manually.');
      setNotFoundCode(code);
    } finally {
      setBusy(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    void lookupBarcode(manualCode.trim());
  }

  return (
    <div className="scanner-layout">
      <section className="card scanner-card">
        <div className="card-title">
          <h2>
            <ScanBarcode size={20}/> Barcode scanner
          </h2>
          <span className="subtle-chip">
            <ShieldCheck size={13}/> CACHED LOCALLY
          </span>
        </div>

        <p style={{fontSize: '11px', color: '#9aa989', marginTop: '10px', lineHeight: 1.6}}>
          Scan any packaged food barcode (UPC / EAN) to look up its nutrition and add it to your meals.
        </p>

        <div className={`camera-zone ${scanning ? 'has-photo' : ''}`} style={{minHeight: '300px', position: 'relative'}}>
          {scanning ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px'}}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '20% 15%',
                  border: '2px solid var(--lime)',
                  borderRadius: '12px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <div style={{width: '90%', height: '2px', background: 'var(--lime)', opacity: 0.8}}/>
              </div>
              <button
                className="clear-photo"
                aria-label="Stop camera"
                onClick={stopCamera}
                style={{position: 'absolute', top: '10px', right: '10px', zIndex: 10}}
              >
                <X size={17}/>
              </button>
            </>
          ) : (
            <>
              <div className="camera-illustration">
                <ScanBarcode size={62}/>
                <span>📦</span>
              </div>
              <h3>Scan product barcode</h3>
              <p>
                Point camera at barcode or upload a photo.<br/>
                UPC-A, EAN-13, and Code-128 supported.
              </p>
            </>
          )}

          {busy && (
            <div className="scan-loading">
              <LoaderCircle className="spin" size={30}/>
              <span>Looking up product details…</span>
            </div>
          )}
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handlePhotoFile(file);
            e.target.value = '';
          }}
        />

        <div className="camera-actions">
          {scanning ? (
            <button className="secondary-button full" onClick={stopCamera}>
              <X size={17}/> Stop camera
            </button>
          ) : (
            <button className="primary-button" disabled={busy} onClick={() => void startCamera()}>
              <Camera size={18}/> Start camera
            </button>
          )}
          <button className="secondary-button" disabled={busy} onClick={() => photoInputRef.current?.click()}>
            <ImagePlus size={18}/> Barcode photo
          </button>
        </div>

        {statusMessage && (
          <div className="notice scanner-notice" role="alert" style={{marginTop: '16px'}}>
            <CircleHelp size={18}/>
            <p>{statusMessage}</p>
          </div>
        )}

        {notFoundCode && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px',
              border: '1px solid #485437',
              borderRadius: '8px',
              background: '#242b1d'
            }}
          >
            <p style={{fontSize: '11px', color: '#cad8b8', marginBottom: '10px'}}>
              Would you like to add a custom food with barcode <strong>{notFoundCode}</strong>?
            </p>
            <button
              className="primary-button full"
              style={{fontSize: '11px', padding: '8px 12px'}}
              onClick={() => onPick(notFoundCode)}
            >
              <Plus size={15}/> Add custom food for this barcode
            </button>
          </div>
        )}

        <div style={{marginTop: '24px', paddingTop: '18px', borderTop: '1px solid #343e2a'}}>
          <h3 style={{fontSize: '13px', marginBottom: '8px', color: '#c4d3b2'}}>Manual barcode entry</h3>
          <form onSubmit={handleManualSubmit} style={{display: 'flex', gap: '8px'}}>
            <input
              type="text"
              placeholder="e.g. 737628064502"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: '#151811',
                border: '1px solid #3b4430',
                borderRadius: '7px',
                color: '#e3eadb',
                fontSize: '12px'
              }}
            />
            <button
              type="submit"
              className="secondary-button"
              disabled={busy || !manualCode.trim()}
              style={{padding: '0 16px', whiteSpace: 'nowrap'}}
            >
              <Search size={15}/> Look up
            </button>
          </form>
        </div>
      </section>

      <aside className="scanner-info">
        <div className="card">
          <h2>Packaged food lookup</h2>
          <ol>
            <li>Scan or type barcode number</li>
            <li>Instant nutrition from Open Food Facts</li>
            <li>Cached locally for offline access</li>
          </ol>
          <div className="model-status">
            <ShieldCheck size={15}/>
            <span>
              Once scanned, foods are saved in your offline database.
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
