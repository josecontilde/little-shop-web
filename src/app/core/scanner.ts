import { readBarcodes } from 'zxing-wasm/reader';

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

type ScanCallback = (code: string) => void;

let wasmPrewarmed = false;

export function prewarmZXing() {
  if (wasmPrewarmed) return;
  wasmPrewarmed = true;
  readBarcodes(
    new ImageData(new Uint8ClampedArray(4), 1, 1),
    { formats: ['EAN13'], maxNumberOfSymbols: 0 },
  ).catch(() => {});
}

export class Scanner {
  private stream: MediaStream | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private detections: { code: string; time: number }[] = [];
  private decoding = false;
  private frameCount = 0;

  async start(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    this.stopped = false;
    this.detections = [];
    this.frameCount = 0;
    container.innerHTML = '';

    if ('BarcodeDetector' in window) {
      return this.startNative(container, onDetected);
    }
    return this.startZXing(container, onDetected);
  }

  stop() {
    this.stopped = true;
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl.remove();
      this.videoEl = null;
    }
    this.canvas = null;
    this.ctx = null;
  }

  get isRunning(): boolean {
    return !this.stopped;
  }

  private async startNative(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.muted = true;
    container.appendChild(video);
    this.videoEl = video;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = this.stream;
    await video.play();

    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e'],
    });

    return new Promise((resolve) => {
      this.scanInterval = setInterval(async () => {
        if (this.stopped || video.readyState < video.HAVE_ENOUGH_DATA) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            this.stop();
            onDetected(barcodes[0].rawValue);
          }
        } catch {
          /* ignore */
        }
      }, 300);
      resolve();
    });
  }

  private async startZXing(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.background = '#000';
    container.appendChild(video);
    this.videoEl = video;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    });
    video.srcObject = this.stream;
    await video.play();

    return new Promise((resolve) => {
      const tick = async () => {
        if (this.stopped) return;
        await this.scanFrame(onDetected);
        this.scanInterval = setTimeout(tick, 300);
      };
      tick();
      resolve();
    });
  }

  private async scanFrame(onDetected: ScanCallback) {
    if (this.decoding) return;
    const video = this.videoEl;
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!video || !canvas || !ctx || video.readyState < video.HAVE_ENOUGH_DATA) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return;

    this.frameCount++;
    this.decoding = true;

    try {
      const useFullFrame = this.frameCount % 3 === 0;
      let imageData: ImageData;

      if (useFullFrame) {
        const scale = Math.min(1, 640 / Math.max(vw, vh));
        const fw = Math.round(vw * scale);
        const fh = Math.round(vh * scale);
        canvas.width = fw;
        canvas.height = fh;
        ctx.drawImage(video, 0, 0, vw, vh, 0, 0, fw, fh);
        imageData = ctx.getImageData(0, 0, fw, fh);
      } else {
        const stripHeight = Math.max(80, Math.round(vh * 0.6));
        const stripY = Math.round((vh - stripHeight) / 2);
        canvas.width = vw;
        canvas.height = stripHeight;
        ctx.drawImage(video, 0, stripY, vw, stripHeight, 0, 0, vw, stripHeight);
        imageData = ctx.getImageData(0, 0, vw, stripHeight);
      }

      const results = await readBarcodes(imageData, {
        tryHarder: true,
        formats: [
          'EAN13',
          'EAN8',
          'UPCA',
          'UPCE',
          'Code128',
          'Code39',
          'ITF',
        ],
        maxNumberOfSymbols: 1,
      });

      if (results.length === 0) return;
      const code = results[0].text;
      if (!code || code.length < 3) return;

      const now = Date.now();
      this.detections = this.detections.filter((d) => now - d.time < 2000);
      this.detections.push({ code, time: now });

      const sameCode = this.detections.filter((d) => d.code === code);
      if (sameCode.length >= 2) {
        this.detections = [];
        this.stop();
        onDetected(code);
      }
    } catch {
      /* ignore */
    } finally {
      this.decoding = false;
    }
  }
}
