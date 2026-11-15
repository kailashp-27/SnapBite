import {describe, it, expect, beforeEach, vi} from 'vitest';
import {mixedManifest, prepareMixed, type MixedManifest} from './mixed-model-assets';

describe('mixed-model-assets', () => {
  const dummyEncoderBytes = new Uint8Array([1, 2, 3, 4]);
  const dummyDecoderBytes = new Uint8Array([5, 6, 7, 8]);
  let encoderHash: string;
  let decoderHash: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    const encoderDigest = await crypto.subtle.digest('SHA-256', dummyEncoderBytes);
    encoderHash = Array.from(new Uint8Array(encoderDigest), b => b.toString(16).padStart(2, '0')).join('');
    const decoderDigest = await crypto.subtle.digest('SHA-256', dummyDecoderBytes);
    decoderHash = Array.from(new Uint8Array(decoderDigest), b => b.toString(16).padStart(2, '0')).join('');

    const cacheStore = new Map<string, Response>();
    const mockCache = {
      match: vi.fn(async (key: string) => cacheStore.get(key) || null),
      put: vi.fn(async (key: string, resp: Response) => {
        cacheStore.set(key, resp);
      }),
    };
    (globalThis as unknown as {caches: unknown}).caches = {
      open: vi.fn(async () => mockCache),
    };
  });

  it('validates mixed manifest format', async () => {
    const mockManifestData = {
      version: 'mixed-v1',
      modelRevision: '5850ab45f587c112167512ffef949107115e26a0',
      assets: [
        {
          id: 'encoder',
          url: '/models/mixed-v1/encoder.cce23c7b2e5d.onnx',
          bytes: 8882165,
          sha256: 'cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971',
        },
        {
          id: 'decoder',
          url: '/models/mixed-v1/decoder.cb90b279f549.onnx',
          bytes: 4903810,
          sha256: 'cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2',
        },
      ],
      totalBytes: 13785975,
    };

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockManifestData), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });

    const manifest = await mixedManifest();
    expect(manifest.version).toBe('mixed-v1');
    expect(manifest.assets.length).toBe(2);
  });

  it('falls back to CDN when local model URL returns text/html (SPA catch-all)', async () => {
    const manifest: MixedManifest = {
      version: 'mixed-v1',
      modelRevision: '5850ab45f587c112167512ffef949107115e26a0',
      assets: [
        {
          id: 'encoder',
          url: '/models/mixed-v1/encoder.test.onnx',
          bytes: dummyEncoderBytes.byteLength,
          sha256: encoderHash,
        },
        {
          id: 'decoder',
          url: '/models/mixed-v1/decoder.test.onnx',
          bytes: dummyDecoderBytes.byteLength,
          sha256: decoderHash,
        },
      ],
      totalBytes: dummyEncoderBytes.byteLength + dummyDecoderBytes.byteLength,
    };

    // Mock scannerManifest
    vi.mock('./scanner-assets', async () => {
      return {
        SCANNER_CACHE: 'snapbite-scanner-v1',
        prepareScanner: vi.fn(async () => {}),
        scannerManifest: vi.fn(async () => ({totalBytes: 100, assets: []})),
        scannerReady: vi.fn(async () => true),
        cachedScannerAsset: vi.fn(),
      };
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      // If asking for local onnx, pretend Netlify served index.html
      if (url.includes('/models/mixed-v1/') && url.endsWith('.onnx')) {
        return new Response('<!DOCTYPE html><html><body>Netlify SPA index.html</body></html>', {
          status: 200,
          headers: {'Content-Type': 'text/html; charset=UTF-8'},
        });
      }
      // If asking for CDN vision_encoder
      if (url.includes('vision_encoder_quantized.onnx')) {
        return new Response(dummyEncoderBytes, {
          status: 200,
          headers: {'Content-Type': 'application/octet-stream'},
        });
      }
      // If asking for CDN prompt_encoder_mask_decoder
      if (url.includes('prompt_encoder_mask_decoder_quantized.onnx')) {
        return new Response(dummyDecoderBytes, {
          status: 200,
          headers: {'Content-Type': 'application/octet-stream'},
        });
      }
      return new Response('Not found', {status: 404});
    });

    const progressReports: Array<{loaded: number; total: number; file: string}> = [];
    const controller = new AbortController();

    await prepareMixed(manifest, p => progressReports.push(p), controller.signal);

    // Verify it succeeded and cached both files
    expect(progressReports.length).toBeGreaterThan(0);
    expect(progressReports[progressReports.length - 1].file).toBe('ready');

    const cache = await caches.open('snapbite-scanner-v1');
    const cachedEncoder = await cache.match('/models/mixed-v1/encoder.test.onnx');
    expect(cachedEncoder).toBeTruthy();
    expect(cachedEncoder?.headers.get('X-SnapBite-SHA256')).toBe(encoderHash);
  });

  it('rejects corrupted downloads where SHA256 integrity check fails', async () => {
    const corruptBytes = new Uint8Array([99, 99, 99, 99]);
    const manifest: MixedManifest = {
      version: 'mixed-v1',
      modelRevision: '5850ab45f587c112167512ffef949107115e26a0',
      assets: [
        {
          id: 'encoder',
          url: '/models/mixed-v1/encoder.test.onnx',
          bytes: corruptBytes.byteLength,
          sha256: 'deadbeef'.repeat(8), // Invalid expected hash
        },
        {
          id: 'decoder',
          url: '/models/mixed-v1/decoder.test.onnx',
          bytes: 4,
          sha256: 'deadbeef'.repeat(8),
        },
      ],
      totalBytes: 8,
    };

    globalThis.fetch = vi.fn(async () => {
      return new Response(corruptBytes, {
        status: 200,
        headers: {'Content-Type': 'application/octet-stream'},
      });
    });

    const controller = new AbortController();
    await expect(prepareMixed(manifest, () => {}, controller.signal)).rejects.toThrow(
      'The mixed-meal model failed its integrity check'
    );
  });
});
