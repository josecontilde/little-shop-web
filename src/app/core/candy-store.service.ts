import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AdminSection,
  AdminUser,
  CartItem,
  ConsumptionRecord,
  PaymentMode,
  Product,
  Provider,
  Suggestion,
  View,
} from './models';

type Summary = {
  inventoryValue: number;
  monthlyTotal: number;
  outstandingTotal: number;
  paidNowTotal: number;
  averageRating: number;
  pendingSuggestions: number;
  personSummaries: {
    employee: string;
    items: number;
    total: number;
    pending: number;
    paid: number;
  }[];
  productSummaries: { productName: string; quantity: number; total: number }[];
};

type AuthUser = {
  name: string;
  email: string;
  provider: Provider;
  role: AdminUser['role'];
  status: AdminUser['status'];
};

@Injectable({ providedIn: 'root' })
export class CandyStoreService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${window.location.protocol}//${window.location.hostname}:3000/api`;

  readonly view = signal<View>('store');
  readonly adminSection = signal<AdminSection>('dashboard');
  readonly products = signal<Product[]>([]);
  readonly cart = signal<CartItem[]>([]);
  readonly suggestions = signal<Suggestion[]>([]);
  readonly consumptionRecords = signal<ConsumptionRecord[]>([]);
  readonly adminUsers = signal<AdminUser[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly user = signal<AuthUser | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'Admin');
  readonly isNormalUser = computed(() => !!this.user() && !this.isAdmin());
  readonly accountFirstName = computed(() => this.user()?.name.trim().split(' ')[0] ?? '');

  readonly suggestionName = signal('');
  readonly suggestionReason = signal('');
  readonly productName = signal('');
  readonly productCategory = signal('');
  readonly productUnit = signal('');
  readonly productPrice = signal<number | null>(null);
  readonly productStock = signal<number | null>(null);
  readonly productBarcode = signal('');
  readonly paymentMode = signal<PaymentMode>('Fin de mes');
  readonly yapePaymentConfirmed = signal(false);

  readonly cartCount = computed(() =>
    this.cart().reduce((total, item) => total + item.quantity, 0),
  );
  readonly cartTotal = computed(() =>
    this.cart().reduce((total, item) => total + item.price * item.quantity, 0),
  );
  readonly canRegisterConsumption = computed(
    () =>
      !!this.user() &&
      !!this.cart().length &&
      (this.paymentMode() !== 'Pagado al momento' || this.yapePaymentConfirmed()),
  );
  readonly inventoryValue = computed(() => this.summary()?.inventoryValue ?? 0);
  readonly averageRating = computed(() => this.summary()?.averageRating ?? 0);
  readonly pendingSuggestions = computed(() => this.summary()?.pendingSuggestions ?? 0);
  readonly monthlyTotal = computed(() => this.summary()?.monthlyTotal ?? 0);
  readonly outstandingTotal = computed(() => this.summary()?.outstandingTotal ?? 0);
  readonly paidNowTotal = computed(() => this.summary()?.paidNowTotal ?? 0);
  readonly accountMonthlyTotal = computed(() =>
    this.accountRecords().reduce((total, record) => total + record.total, 0),
  );
  readonly accountOutstandingTotal = computed(() =>
    this.accountRecords().reduce((total, record) => total + (record.paid ? 0 : record.total), 0),
  );
  readonly accountPaidNowTotal = computed(() =>
    this.accountRecords().reduce(
      (total, record) => total + (record.paymentMode === 'Pagado al momento' ? record.total : 0),
      0,
    ),
  );
  readonly accountHistory = computed(() => this.consumptionRecords());
  readonly personSummaries = computed(() => this.summary()?.personSummaries ?? []);
  readonly productSummaries = computed(() => this.summary()?.productSummaries ?? []);
  private currentMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private readonly accountRecords = computed(() => {
    const email = this.user()?.email;
    if (!email) {
      return [];
    }
    return this.consumptionRecords().filter(
      (record) => record.employeeEmail === email && record.month === this.currentMonth(),
    );
  });

  constructor() {
    this.checkSession();
  }

  refreshAll() {
    this.loading.set(true);
    this.error.set(null);
    this.loadProducts();
    if (this.isAdmin()) {
      this.loadSuggestions();
      this.loadUsers();
      this.loadSummary();
    } else {
      this.suggestions.set([]);
      this.adminUsers.set([]);
      this.summary.set(null);
    }
    this.loadConsumptions(() => this.loading.set(false));
  }

  setView(view: View) {
    if (view === 'admin' && !this.isAdmin()) {
      this.view.set('store');
      return;
    }
    if (view === 'account' && !this.isNormalUser()) {
      this.view.set('store');
      return;
    }
    this.view.set(view);
  }

  setAdminSection(section: AdminSection) {
    if (!this.isAdmin()) {
      this.view.set('store');
      return;
    }
    this.adminSection.set(section);
    this.view.set('admin');
  }

  login(provider: Provider) {
    const returnTo = encodeURIComponent(window.location.origin);
    window.location.assign(`${this.apiUrl}/auth/login/${provider}?returnTo=${returnTo}`);
  }

  logout() {
    this.http.post<void>(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.clearSession(),
      error: () => this.clearSession(),
    });
  }

  addToCart(product: Product) {
    if (!this.user()) {
      this.setError('Inicia sesión con tu cuenta para comprar.');
      return;
    }

    this.cart.update((items) => {
      const existing = items.find((item) => item.id === product.id);

      if (existing) {
        return items.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item,
        );
      }

      return [...items, { ...product, quantity: 1 }];
    });
    this.yapePaymentConfirmed.set(false);
  }

  removeFromCart(productId: number) {
    this.cart.update((items) => items.filter((item) => item.id !== productId));
    this.yapePaymentConfirmed.set(false);
  }

  decreaseCartItem(productId: number) {
    this.cart.update((items) =>
      items
        .map((item) => (item.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0),
    );
    this.yapePaymentConfirmed.set(false);
  }

  cartQuantity(productId: number) {
    return this.cart().find((item) => item.id === productId)?.quantity ?? 0;
  }

  rateProduct(productId: number, rating: number) {
    this.http.post<Product>(`${this.apiUrl}/products/${productId}/rating`, { rating }).subscribe({
      next: (updated) => {
        this.products.update((products) =>
          products.map((product) => (product.id === updated.id ? updated : product)),
        );
        this.loadSummary();
      },
      error: () => this.setError('No se pudo calificar el producto.'),
    });
  }

  submitSuggestion() {
    const name = this.suggestionName().trim();
    const reason = this.suggestionReason().trim();

    if (!name || !reason) {
      return;
    }

    this.http.post<Suggestion>(`${this.apiUrl}/suggestions`, { name, reason }).subscribe({
      next: (suggestion) => {
        this.suggestions.update((suggestions) => [suggestion, ...suggestions]);
        this.suggestionName.set('');
        this.suggestionReason.set('');
        if (this.isAdmin()) {
          this.loadSummary();
        }
      },
      error: () => this.setError('No se pudo enviar la sugerencia.'),
    });
  }

  addProduct() {
    const name = this.productName().trim();
    const category = this.productCategory().trim();
    const unit = this.productUnit().trim();
    const price = this.productPrice();
    const stock = this.productStock();
    const barcode = this.productBarcode().trim();

    if (!name || !category || price === null || stock === null || price <= 0 || stock < 0) {
      return;
    }

    this.http
      .post<Product>(
        `${this.apiUrl}/products`,
        {
          name,
          category,
          unit,
          price,
          stock,
          barcode,
          description: '',
          image: '',
        },
        { withCredentials: true },
      )
      .subscribe({
        next: (product) => {
          this.products.update((products) => [product, ...products]);
          this.productName.set('');
          this.productCategory.set('');
          this.productUnit.set('');
          this.productPrice.set(null);
          this.productStock.set(null);
          this.productBarcode.set('');
          this.loadSummary();
        },
        error: (err) => {
          if (err.status === 409) {
            this.setError('Ese código de barras ya está registrado en otro producto.');
          } else {
            this.setError('No se pudo agregar el producto.');
          }
        },
      });
  }

  deleteProduct(productId: number) {
    this.http
      .delete<void>(`${this.apiUrl}/products/${productId}`, { withCredentials: true })
      .subscribe({
        next: () => {
          this.products.update((products) =>
            products.filter((product) => product.id !== productId),
          );
          this.cart.update((items) => items.filter((item) => item.id !== productId));
          this.loadSummary();
        },
        error: () => this.setError('No se pudo eliminar el producto.'),
      });
  }

  setPaymentMode(mode: PaymentMode) {
    this.paymentMode.set(mode);
    this.yapePaymentConfirmed.set(false);
  }

  setYapePaymentConfirmed(confirmed: boolean) {
    this.yapePaymentConfirmed.set(confirmed);
  }

  registerConsumption() {
    const employee = this.user()?.name;
    const items = this.cart();

    if (!employee || !items.length) {
      return;
    }

    if (this.paymentMode() === 'Pagado al momento' && !this.yapePaymentConfirmed()) {
      this.setError('Escanea el QR de Yape y confirma el pago antes de registrar.');
      return;
    }

    this.http
      .post<ConsumptionRecord>(
        `${this.apiUrl}/consumptions`,
        {
          paymentMode: this.paymentMode(),
          items: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
        },
        { withCredentials: true },
      )
      .subscribe({
        next: (record) => {
          this.consumptionRecords.update((records) => [record, ...records]);
          this.cart.set([]);
          this.yapePaymentConfirmed.set(false);
          this.loadProducts();
          if (this.isAdmin()) {
            this.loadSummary();
            this.loadConsumptions();
            this.view.set('admin');
            this.adminSection.set('ledger');
          } else {
            this.loadConsumptions();
            this.view.set('account');
          }
        },
        error: () => this.setError('No se pudo registrar la compra.'),
      });
  }

  payConsumption(recordId: string) {
    this.http
      .patch<ConsumptionRecord>(
        `${this.apiUrl}/consumptions/${recordId}/pay`,
        {},
        { withCredentials: true },
      )
      .subscribe({
        next: (updated) => {
          this.consumptionRecords.update((records) =>
            records.map((record) => (record.id === updated.id ? updated : record)),
          );
        },
        error: () => this.setError('No se pudo registrar el pago.'),
      });
  }

  payMonthConsumptions(month: string) {
    this.http
      .post<ConsumptionRecord[]>(
        `${this.apiUrl}/consumptions/pay-month`,
        { month },
        { withCredentials: true },
      )
      .subscribe({
        next: (updated) => {
          const updatedMap = new Map(updated.map((r) => [r.id, r]));
          this.consumptionRecords.update((records) =>
            records.map((record) => updatedMap.get(record.id) ?? record),
          );
        },
        error: () => this.setError('No se pudo registrar el pago del mes.'),
      });
  }

  markConsumptionPaid(recordId: string) {
    this.http
      .patch<ConsumptionRecord>(
        `${this.apiUrl}/consumptions/${recordId}/paid`,
        {},
        { withCredentials: true },
      )
      .subscribe({
        next: (updated) => {
          this.consumptionRecords.update((records) =>
            records.map((record) => (record.id === updated.id ? updated : record)),
          );
          this.loadSummary();
        },
        error: () => this.setError('No se pudo marcar el consumo como pagado.'),
      });
  }

  toggleUserStatus(userId: number) {
    const current = this.adminUsers().find((user) => user.id === userId);
    if (!current) {
      return;
    }

    const status: AdminUser['status'] = current.status === 'Activo' ? 'Bloqueado' : 'Activo';
    this.http
      .patch<AdminUser>(
        `${this.apiUrl}/users/${userId}/status`,
        { status },
        { withCredentials: true },
      )
      .subscribe({
        next: (updated) => {
          this.adminUsers.update((users) =>
            users.map((user) => (user.id === updated.id ? updated : user)),
          );
        },
        error: () => this.setError('No se pudo cambiar el estado del usuario.'),
      });
  }

  updateSuggestionStatus(suggestionId: number, status: Suggestion['status']) {
    this.http
      .patch<Suggestion>(
        `${this.apiUrl}/suggestions/${suggestionId}/status`,
        { status },
        { withCredentials: true },
      )
      .subscribe({
        next: (updated) => {
          this.suggestions.update((suggestions) =>
            suggestions.map((suggestion) => (suggestion.id === updated.id ? updated : suggestion)),
          );
          this.loadSummary();
        },
        error: () => this.setError('No se pudo cambiar el estado de la sugerencia.'),
      });
  }

  private loadProducts() {
    this.http.get<Product[]>(`${this.apiUrl}/products`).subscribe({
      next: (products) => this.products.set(products),
      error: () => this.setError('No se pudo cargar productos.'),
    });
  }

  private checkSession() {
    this.http.get<AuthUser>(`${this.apiUrl}/auth/me`, { withCredentials: true }).subscribe({
      next: (user) => {
        this.user.set(user);
        this.refreshAll();
      },
      error: () => {
        this.clearSession();
        this.loading.set(false);
      },
    });
  }

  private loadSuggestions() {
    this.http.get<Suggestion[]>(`${this.apiUrl}/suggestions`).subscribe({
      next: (suggestions) => this.suggestions.set(suggestions),
      error: () => this.setError('No se pudo cargar sugerencias.'),
    });
  }

  private loadConsumptions(onComplete?: () => void) {
    this.http
      .get<ConsumptionRecord[]>(`${this.apiUrl}/consumptions`, { withCredentials: true })
      .subscribe({
        next: (records) => {
          const email = this.user()?.email;
          this.consumptionRecords.set(
            this.isAdmin() || !email
              ? records
              : records.filter((record) => record.employeeEmail === email),
          );
        },
        error: () => this.setError('No se pudo cargar consumos.'),
        complete: onComplete,
      });
  }

  private loadUsers() {
    this.http.get<AdminUser[]>(`${this.apiUrl}/users`, { withCredentials: true }).subscribe({
      next: (users) => this.adminUsers.set(users),
      error: () => this.setError('No se pudo cargar usuarios.'),
    });
  }

  private loadSummary(onComplete?: () => void) {
    this.http.get<Summary>(`${this.apiUrl}/summary`, { withCredentials: true }).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.setError('No se pudo cargar el resumen.'),
      complete: onComplete,
    });
  }

  private setError(message: string) {
    this.error.set(message);
    this.loading.set(false);
  }

  private clearSession() {
    this.user.set(null);
    this.cart.set([]);
    this.consumptionRecords.set([]);
    this.suggestions.set([]);
    this.adminUsers.set([]);
    this.summary.set(null);
    this.view.set('store');
  }
}
