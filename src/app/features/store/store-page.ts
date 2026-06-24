import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { LucideCandy, LucideCheckCircle, LucideScan, LucideShoppingBag } from '@lucide/angular';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CandyStoreService } from '../../core/candy-store.service';
import { Scanner } from '../../core/scanner';

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
  private scanner = new Scanner();

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
      this.scannerMessage.set('Preparando escáner…');
    }

    const video = document.querySelector<HTMLVideoElement>('#store-scanner-video');
    if (!video) {
      this.scannerMessage.set('Error interno. Intenta de nuevo.');
      this.scannerLoading.set(false);
      return;
    }

    try {
      this.scannerLoading.set(false);
      this.scannerMessage.set('Enfoca el código de barras del producto.');
      await this.scanner.start(video, (code) => {
        this.scannerMessage.set(`Código detectado: ${code}`);
        const product = this.store.products().find((p) => p.barcode === code);
        if (product) {
          this.store.addToCart(product);
          this.scannerMessage.set(`¡${product.name} agregado al carrito!`);
          setTimeout(() => this.closeScanner(), 1200);
        } else {
          this.scannerMessage.set('Producto no registrado. Pide al admin agregarlo.');
        }
      });
    } catch {
      this.scannerMessage.set('No se pudo acceder a la cámara.');
      this.scannerLoading.set(false);
    }
  }

  closeScanner() {
    this.scanner.stop();
    this.scannerOpen.set(false);
    this.scannerMessage.set('');
  }
}
