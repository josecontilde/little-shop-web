import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { LucideCandy, LucideCheckCircle, LucideScan, LucideShoppingBag } from '@lucide/angular';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CandyStoreService } from '../../core/candy-store.service';

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
  static getSupportedFormats(): Promise<string[]>;
}

@Component({
  selector: 'app-store-page',
  imports: [BadgeModule, ButtonModule, CurrencyPipe, LucideCandy, LucideCheckCircle, LucideScan, LucideShoppingBag, DialogModule],
  templateUrl: './store-page.html',
  styleUrl: './store-page.css',
})
export class StorePage {
  readonly store = inject(CandyStoreService);
  readonly yapeModalOpen = signal(false);
  readonly yapeStep = signal<1 | 2>(1);
  readonly yapeProofPreview = signal<string | null>(null);

  readonly scannerOpen = signal(false);
  readonly scannerLoading = signal(false);
  readonly scannerMessage = signal('');
  private stream: MediaStream | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  openYapeModal() {
    this.yapeStep.set(1);
    this.yapeProofPreview.set(null);
    this.store.setYapePaymentConfirmed(false);
    this.yapeModalOpen.set(true);
  }

  onProofSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.yapeProofPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  confirmYapePayment() {
    this.store.setYapePaymentConfirmed(true);
    this.yapeModalOpen.set(false);
  }

  openScanner() {
    this.scannerMessage.set('');
    this.scannerOpen.set(true);
    setTimeout(() => this.startCamera(), 300);
  }

  private async startCamera() {
    this.scannerLoading.set(true);
    this.scannerMessage.set('Activando cámara…');

    if (!('BarcodeDetector' in window)) {
      this.scannerMessage.set('Tu navegador no soporta el escáner. Usa Chrome o Edge.');
      this.scannerLoading.set(false);
      return;
    }

    const video = document.querySelector<HTMLVideoElement>('#store-scanner-video');
    if (!video) {
      this.scannerMessage.set('Error interno. Intenta de nuevo.');
      this.scannerLoading.set(false);
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = this.stream;
      await video.play();

      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'] });
      this.scannerLoading.set(false);
      this.scannerMessage.set('Enfoca el código de barras del producto.');

      this.scanInterval = setInterval(async () => {
        if (video.readyState < video.HAVE_ENOUGH_DATA) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            this.stopCamera();
            this.scannerMessage.set(`Código detectado: ${code}`);
            const product = this.store.products().find((p) => p.barcode === code);
            if (product) {
              this.store.addToCart(product);
              this.scannerMessage.set(`¡${product.name} agregado al carrito!`);
              setTimeout(() => this.closeScanner(), 1200);
            } else {
              this.scannerMessage.set('Producto no registrado. Pide al admin agregarlo.');
            }
          }
        } catch { /* ignore mid-frame errors */ }
      }, 300);
    } catch {
      this.scannerMessage.set('No se pudo acceder a la cámara.');
      this.scannerLoading.set(false);
    }
  }

  private stopCamera() {
    if (this.scanInterval !== null) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  closeScanner() {
    this.stopCamera();
    this.scannerOpen.set(false);
    this.scannerMessage.set('');
  }
}
