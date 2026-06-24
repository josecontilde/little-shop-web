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

  async start(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    this.stopped = false;

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
    video.style.width = '100%';
    video.style.maxHeight = '420px';
    video.style.objectFit = 'cover';
    video.style.background = '#000';
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

  private startQuagga(
    container: HTMLElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: container,
            constraints: {
              facingMode: 'environment',
              aspectRatio: { min: 1, max: 2 },
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
        },
        (err: unknown) => {
          if (err) {
            reject(err);
            return;
          }
          Quagga.start();
          Quagga.onDetected((data: { codeResult: { code: string | null } }) => {
            if (this.stopped) return;
            this.stop();
            if (data.codeResult.code) onDetected(data.codeResult.code);
          });
          resolve();
        },
      );
    });
  }
}
