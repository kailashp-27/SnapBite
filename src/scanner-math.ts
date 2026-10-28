export type ScanMode = 'auto' | 'indian' | 'global';
export interface Prediction {label: string; confidence: number; cuisine: 'indian' | 'global';}
export interface ScannerConfig {
  version: string; inputName: string; globalOutput: string; regionalOutput: string;
  inputSize: number; resizeShortSide: number; mean: number[]; std: number[];
  labels: string[]; regionalLabels: string[]; quantized: boolean;
  modelSha256: string; modelBytes: number;
  routing?: {globalTemperature: number; regionalTemperature: number; otherBias: number};
}
export function softmax(values: ArrayLike<number>): number[] {
  const max = Math.max(...Array.from(values));
  const scores = Array.from(values, value => Math.exp(value - max));
  const sum = scores.reduce((total, score) => total + score, 0);
  if (!Number.isFinite(sum) || sum <= 0) throw Error('The model returned invalid scores.');
  return scores.map(score => score / sum);
}
export function rankPredictions(globalLogits: ArrayLike<number>, regionalLogits: ArrayLike<number>, config: ScannerConfig, mode: ScanMode): Prediction[] {
  if (globalLogits.length !== config.labels.length || regionalLogits.length !== config.regionalLabels.length + 1) throw Error('Model labels do not match the installed model.');
  const routing = config.routing ?? {globalTemperature: 1, regionalTemperature: 1, otherBias: 0};
  if (![routing.globalTemperature, routing.regionalTemperature].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(routing.otherBias)) throw Error('Invalid scanner calibration.');
  const global = softmax(Array.from(globalLogits, value => value / routing.globalTemperature));
  const regional = softmax(Array.from(regionalLogits, (value, index) => value / routing.regionalTemperature + (mode === 'auto' && index === config.regionalLabels.length ? routing.otherBias : 0)));
  const candidates: Prediction[] = [];
  if (mode !== 'indian') config.labels.forEach((label, index) => candidates.push({label, confidence: global[index] * (mode === 'global' ? 1 : regional.at(-1)!), cuisine: 'global'}));
  if (mode !== 'global') config.regionalLabels.forEach((label, index) => candidates.push({label, confidence: regional[index], cuisine: 'indian'}));
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
export function confidentPrediction(predictions: Prediction[]): boolean {
  return !!predictions.length && predictions[0].confidence >= .5 && predictions[0].confidence - (predictions[1]?.confidence ?? 0) >= .12;
}
export function formatScore(value: number): string {
  return value >= .995 ? '99%+' : value < .005 ? '<1%' : `${Math.round(value * 100)}%`;
}
export function normalizePixels(rgba: Uint8ClampedArray, config: Pick<ScannerConfig, 'inputSize' | 'mean' | 'std'>): Float32Array {
  const pixels = config.inputSize ** 2;
  if (rgba.length !== pixels * 4 || config.mean.length !== 3 || config.std.length !== 3 || config.std.some(value => value <= 0)) throw Error('Invalid photo dimensions or normalization.');
  const result = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index++) for (let channel = 0; channel < 3; channel++) result[channel * pixels + index] = (rgba[index * 4 + channel] / 255 - config.mean[channel]) / config.std[channel];
  return result;
}
