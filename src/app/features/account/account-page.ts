import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAlertCircle,
  LucideCalendar,
  LucideCheckCircle,
  LucideClock,
  LucideCreditCard,
  LucideMessageSquare,
  LucidePackage,
  LucideShoppingBag,
  LucideTrendingUp,
  LucideWallet,
} from '@lucide/angular';
import { CandyStoreService } from '../../core/candy-store.service';

type StatusFilter = 'all' | 'pending' | 'paid';

@Component({
  selector: 'app-account-page',
  imports: [
    CurrencyPipe,
    FormsModule,
    LucideShoppingBag,
    LucideWallet,
    LucideAlertCircle,
    LucideCheckCircle,
    LucideCreditCard,
    LucideTrendingUp,
    LucideCalendar,
    LucideClock,
    LucidePackage,
    LucideMessageSquare,
  ],
  templateUrl: './account-page.html',
})
export class AccountPage {
  readonly store = inject(CandyStoreService);
  readonly statusFilter = signal<StatusFilter>('all');
  readonly monthFilter = signal<string>(new Date().toISOString().slice(0, 7));
  readonly statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
  ];

  readonly availableMonths = computed(() => {
    const months = [...new Set(this.store.accountHistory().map((r) => r.month))].sort().reverse();
    return months;
  });

  readonly filteredHistory = computed(() => {
    let records = this.store.accountHistory();
    const m = this.monthFilter();
    const s = this.statusFilter();
    if (m !== 'all') records = records.filter((r) => r.month === m);
    if (s === 'pending') records = records.filter((r) => !r.paid);
    if (s === 'paid') records = records.filter((r) => r.paid);
    return records;
  });

  readonly pendingInFilter = computed(() => this.filteredHistory().filter((r) => !r.paid));

  payAll() {
    const months = [...new Set(this.pendingInFilter().map((r) => r.month))];
    for (const month of months) {
      this.store.payMonthConsumptions(month);
    }
  }

  readonly topProducts = computed(() => {
    const counts = new Map<string, number>();
    for (const record of this.store.accountHistory()) {
      for (const item of record.detail) {
        counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity);
      }
    }
    return [...counts.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  });

  formatMonth(m: string) {
    const [y, mo] = m.split('-');
    return new Date(+y, +mo - 1).toLocaleDateString('es-PE', { month: 'short' });
  }
}
