import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CandyStoreService } from '../../core/candy-store.service';
import { Scanner } from '../../core/scanner';

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
  private scanner = new Scanner();

  openScanner() {
    this.scannerMessage.set('');
    this.scannerOpen.set(true);
    setTimeout(() => this.startCamera(), 300);
  }

  private async startCamera() {
    this.scannerLoading.set(true);
    this.scannerMessage.set('Activando cámara…');

    const container = document.querySelector<HTMLDivElement>('#admin-scanner-container');
    if (!container) {
      this.scannerMessage.set('Error interno. Intenta de nuevo.');
      this.scannerLoading.set(false);
      return;
    }

    try {
      this.scannerMessage.set('Preparando escáner…');
      await this.scanner.start(container, async (code) => {
        this.scannerMessage.set(`Código detectado: ${code}`);
        await this.handleDetectedCode(code);
      });
      this.scannerLoading.set(false);
      this.scannerMessage.set('Enfoca el código de barras del producto.');
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

  closeScanner() {
    this.scanner.stop();
    this.scannerOpen.set(false);
    this.scannerMessage.set('');
  }
}
