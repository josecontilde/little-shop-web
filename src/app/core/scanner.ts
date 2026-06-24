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

  async start(
    videoEl: HTMLVideoElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    this.stopped = false;

    if ('BarcodeDetector' in window) {
      return this.startNative(videoEl, onDetected);
    }
    return this.startQuagga(videoEl, onDetected);
  }

  stop() {
    this.stopped = true;
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      Quagga.stop();
    } catch {
      /* ignore */
    }
  }

  private async startNative(
    video: HTMLVideoElement,
    onDetected: ScanCallback,
  ): Promise<void> {
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
    videoEl: HTMLVideoElement,
    onDetected: ScanCallback,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: videoEl,
            constraints: {
              facingMode: 'environment',
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
