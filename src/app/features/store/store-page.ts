import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { LucideCandy, LucideCheckCircle, LucideShoppingBag } from '@lucide/angular';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DynamicToastService } from 'ngx-dynamic-toast';
import { readBarcodes } from 'zxing-wasm/reader';
import { CandyStoreService } from '../../core/candy-store.service';
import { Scanner, prewarmZXing } from '../../core/scanner';

@Component({
  selector: 'app-store-page',
  imports: [BadgeModule, ButtonModule, CurrencyPipe, LucideCandy, LucideCheckCircle, LucideShoppingBag, DialogModule],
  templateUrl: './store-page.html',
  styleUrl: './store-page.css',
})
export class StorePage {
  readonly store = inject(CandyStoreService);
  readonly toast = inject(DynamicToastService);
  readonly yapeModalOpen = signal(false);
  readonly yapeStep = signal<1 | 2>(1);
  readonly yapeProofPreview = signal<string | null>(null);
  readonly scanFileLoading = signal(false);

  readonly scannerOpen = signal(false);
  readonly scannerLoading = signal(false);
  readonly scannerMessage = signal('');
  readonly showScanHint = signal(false);
  private scanner = new Scanner();
  private scannerStartTime = 0;
  private hintTimeout: ReturnType<typeof setTimeout> | null = null;

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
    this.showScanHint.set(false);
    prewarmZXing();
    setTimeout(() => this.startCamera(), 300);
  }

  private async startCamera() {
    this.scannerLoading.set(true);
    this.scannerMessage.set('Activando cámara…');
    this.scannerStartTime = Date.now();
    this.showScanHint.set(false);

    const container = document.querySelector<HTMLDivElement>('#store-scanner-container');
    if (!container) {
      this.scannerMessage.set('Error interno. Intenta de nuevo.');
      this.scannerLoading.set(false);
      return;
    }

    try {
      this.scannerMessage.set('Preparando escáner…');
      await this.scanner.start(container, (code) => {
        this.clearHintTimeout();
        this.scannerMessage.set(`Código detectado: ${code}`);
        const product = this.store.products().find((p) => p.barcode === code);
        if (product) {
          this.store.addToCart(product);
          this.scannerMessage.set(`¡${product.name} agregado al carrito!`);
          setTimeout(() => this.closeScanner(), 1200);
        } else {
          this.toast.warning('Producto no registrado', {
            description: `Código: ${code}. Pide al administrador agregarlo.`,
            duration: 5000,
          });
          this.scannerMessage.set('Producto no registrado. Escanea otro.');
          this.scanner.stop();
          this.scannerOpen.set(false);
          setTimeout(() => {
            this.scannerMessage.set('');
            this.scannerOpen.set(true);
            setTimeout(() => this.startCamera(), 300);
          }, 1500);
        }
      });
      this.scannerLoading.set(false);
      this.scannerMessage.set('Enfoca el código de barras del producto.');

      this.hintTimeout = setTimeout(() => {
        if (this.scannerOpen() && !this.scannerLoading()) {
          this.showScanHint.set(true);
        }
      }, 10000);
    } catch {
      this.scannerMessage.set('No se pudo acceder a la cámara.');
      this.scannerLoading.set(false);
    }
  }

  private clearHintTimeout() {
    if (this.hintTimeout) {
      clearTimeout(this.hintTimeout);
      this.hintTimeout = null;
    }
  }

  scanFromFile() {
    const input = document.querySelector<HTMLInputElement>('#store-scanner-file-input');
    input?.click();
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.scanFileLoading.set(true);
    this.scannerMessage.set('Leyendo imagen…');

    try {
      const results = await readBarcodes(file, {
        tryHarder: true,
        formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'ITF'],
        maxNumberOfSymbols: 1,
      });

      if (results.length === 0) {
        this.toast.error('No se detectó código', {
          description: 'Prueba con otra foto o usa la cámara.',
          duration: 4000,
        });
        return;
      }

      const code = results[0].text;
      this.handleDetectedCode(code);
    } catch {
      this.toast.error('Error al leer imagen', {
        description: 'Intenta con otra foto.',
        duration: 4000,
      });
    } finally {
      this.scanFileLoading.set(false);
    }
  }

  private handleDetectedCode(code: string) {
    this.scannerMessage.set(`Código detectado: ${code}`);
    const product = this.store.products().find((p) => p.barcode === code);
    if (product) {
      this.store.addToCart(product);
      this.scannerMessage.set(`¡${product.name} agregado al carrito!`);
      setTimeout(() => this.closeScanner(), 1200);
    } else {
      this.toast.warning('Producto no registrado', {
        description: `Código: ${code}. Pide al administrador agregarlo.`,
        duration: 5000,
      });
      this.scannerMessage.set('Producto no registrado.');
    }
  }

  closeScanner() {
    this.clearHintTimeout();
    this.scanner.stop();
    this.scannerOpen.set(false);
    this.scannerMessage.set('');
    this.showScanHint.set(false);
  }
}
