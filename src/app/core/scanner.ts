import Quagga from '@ericblade/quagga2';

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

type ScanCallback = (code: string) => void;

export class Scanner {
  private stream: MediaStream | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private videoEl: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;

  async start(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    this.stopped = false;
    container.innerHTML = '';

    if ('BarcodeDetector' in window) {
      return this.startNative(container, onDetected);
    }
    return this.startQuagga(container, onDetected);
  }

  stop() {
    this.stopped = true;
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl.remove();
      this.videoEl = null;
    }
    try {
      Quagga.stop();
    } catch {
      /* ignore */
    }
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

  private async ensureQuaggaVideoPlaysinline(container: HTMLElement) {
    const video = container.querySelector('video');
    if (video) {
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.muted = true;
      return;
    }
    this.observer = new MutationObserver(() => {
      const v = container.querySelector('video');
      if (v) {
        v.setAttribute('playsinline', '');
        v.setAttribute('muted', '');
        v.muted = true;
        this.observer?.disconnect();
        this.observer = null;
      }
    });
    this.observer.observe(container, { childList: true, subtree: true });
  }

  private startQuagga(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    let detections: { code: string; time: number }[] = [];

    return new Promise((resolve, reject) => {
      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: container,
            constraints: {
              facingMode: { ideal: 'environment' },
            },
          },
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'code_128_reader',
              'upc_reader',
              'upc_e_reader',
            ],
          },
          locate: false,
          frequency: 10,
        },
        async (err: unknown) => {
          if (err) {
            reject(err);
            return;
          }
          await this.ensureQuaggaVideoPlaysinline(container);
          Quagga.start();
          Quagga.onDetected((data: { codeResult: { code: string | null } }) => {
            if (this.stopped) return;
            const code = data.codeResult?.code;
            if (!code || code.length < 3) return;

            const now = Date.now();
            detections = detections.filter((d) => now - d.time < 2000);
            detections.push({ code, time: now });

            const sameCode = detections.filter((d) => d.code === code);
            if (sameCode.length >= 3) {
              detections = [];
              this.stop();
              onDetected(code);
            }
          });
          resolve();
        },
      );
    });
  }
}
