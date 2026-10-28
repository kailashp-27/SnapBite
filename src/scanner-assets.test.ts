import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cachedScannerAsset, prepareScanner, scannerReady, type ScannerManifest} from './scanner-assets';
import type {ScannerConfig} from './scanner-math';

const entries = new Map<string, Response>();
const data = [new TextEncoder().encode('model weights'), new TextEncoder().encode('wasm runtime'), new TextEncoder().encode('module source')];
async function manifest(): Promise<ScannerManifest> {
  const assets = await Promise.all((['model','wasm','module'] as const).map(async(id,index) => ({id,url:`/models/snapbite-v1/${id}.bin`,bytes:data[index].byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data[index])),value=>value.toString(16).padStart(2,'0')).join('')})));
  return {version:'snapbite-v1',config:{} as ScannerConfig,assets,totalBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0)};
}
beforeEach(() => {
  entries.clear();
  vi.stubGlobal('caches',{open:async()=>({match:async(url:string)=>entries.get(url)?.clone(),put:async(url:string,response:Response)=>{entries.set(url,response.clone());}})});
});
afterEach(() => vi.unstubAllGlobals());
describe('offline scanner assets', () => {
  it('verifies all asset bytes before marking the scanner ready', async () => {
    const pack=await manifest();
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(data[pack.assets.findIndex(asset=>asset.url===url)])));
    expect(await scannerReady(pack)).toBe(false);
    await prepareScanner(pack,()=>{});
    expect(await scannerReady(pack)).toBe(true);
    expect(new Uint8Array(await cachedScannerAsset(pack.assets[0]))).toEqual(data[0]);
  });
  it('retains completed files across an interrupted setup', async () => {
    const pack=await manifest();
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(url===pack.assets[1].url)throw Error('Network unavailable');return new Response(data[0]);}));
    await expect(prepareScanner(pack,()=>{})).rejects.toThrow();
    expect(entries.has(pack.assets[0].url)).toBe(true); expect(await scannerReady(pack)).toBe(false);
    const resumed=vi.fn(async(url:string)=>new Response(data[pack.assets.findIndex(asset=>asset.url===url)]));vi.stubGlobal('fetch',resumed);
    await prepareScanner(pack,()=>{});
    expect(resumed).toHaveBeenCalledTimes(2);expect(await scannerReady(pack)).toBe(true);
  });
  it('keeps calibration updates for offline reloads without downloading weights again', async () => {
    const pack = await manifest();
    const fetcher = vi.fn(async(url: string) => new Response(data[pack.assets.findIndex(asset => asset.url === url)]));
    vi.stubGlobal('fetch', fetcher);
    await prepareScanner(pack, () => {});
    fetcher.mockClear();
    const routing = {globalTemperature: .75, regionalTemperature: .9, otherBias: 4.1};
    const updated = {...pack, config: {...pack.config, routing}};
    expect(await scannerReady(updated)).toBe(true);
    expect((await entries.get('/models/snapbite-v1/manifest.json')!.json()).config.routing).toEqual(routing);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects corrupt downloads and corrupt cached data', async () => {
    const pack=await manifest();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(data[0].length))));
    await expect(prepareScanner(pack,()=>{})).rejects.toThrow('integrity');
    expect(entries.has(pack.assets[0].url)).toBe(false);
    entries.set(pack.assets[0].url,new Response(new Uint8Array(data[0].length),{headers:{'X-SnapBite-SHA256':pack.assets[0].sha256}}));
    await expect(cachedScannerAsset(pack.assets[0])).rejects.toThrow('downloaded again');
  });
});
