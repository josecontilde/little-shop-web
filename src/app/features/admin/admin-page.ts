import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CandyStoreService } from '../../core/candy-store.service';

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>;
  static getSupportedFormats(): Promise<string[]>;
}

@Component({
  selector: 'app-admin-page',
  imports: [CurrencyPipe, FormsModule],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.css',
})
export class AdminPage {
  readonly store = inject(CandyStoreService);

  readonly scannerOpen = signal(false);
  readonly scannerLoading = signal(false);
  readonly scannerMessage = signal('');
  private stream: MediaStream | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;

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

    const video = document.querySelector<HTMLVideoElement>('#admin-scanner-video');
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
            await this.handleDetectedCode(code);
          }
        } catch { /* ignore mid-frame errors */ }
      }, 300);
    } catch {
      this.scannerMessage.set('No se pudo acceder a la cámara.');
      this.scannerLoading.set(false);
    }
  }

  private async handleDetectedCode(code: string) {
    const existing = this.store.products().find((p) => p.barcode === code);
    if (existing) {
      this.scannerMessage.set(`Ya existe: ${existing.name}. Puedes editarlo manualmente.`);
      return;
    }
    this.scannerMessage.set('Buscando información del producto…');
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const data = await res.json();
      if (data.status === 1) {
        const p = data.product;
        const name = p.product_name_es || p.product_name || '';
        const category = (p.categories || '').split(',')[0]?.trim() || 'Snacks';
        const unit = p.quantity || '';
        this.store.productBarcode.set(code);
        this.store.productName.set(name);
        this.store.productCategory.set(category);
        this.store.productUnit.set(unit);
        this.scannerMessage.set(`Producto encontrado: ${name}. Revisa y completa precio/stock.`);
      } else {
        this.store.productBarcode.set(code);
        this.scannerMessage.set('Código registrado. Completa los datos manualmente.');
      }
    } catch {
      this.store.productBarcode.set(code);
      this.scannerMessage.set('No se pudo consultar la base de datos. Completa los datos manualmente.');
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
