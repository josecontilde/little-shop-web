import { Component, HostListener, inject, signal } from '@angular/core';
import {
  LucideCandy,
  LucideChevronDown,
  LucideLayoutDashboard,
  LucideLogOut,
  LucideSettings,
  LucideShoppingBag,
} from '@lucide/angular';
import { CandyStoreService } from './core/candy-store.service';
import { AccountPage } from './features/account/account-page';
import { AdminPage } from './features/admin/admin-page';
import { StorePage } from './features/store/store-page';

@Component({
  selector: 'app-root',
  imports: [
    AccountPage,
    AdminPage,
    StorePage,
    LucideCandy,
    LucideShoppingBag,
    LucideLayoutDashboard,
    LucideSettings,
    LucideLogOut,
    LucideChevronDown,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly store = inject(CandyStoreService);
  readonly loginOpen = signal(false);

  @HostListener('document:click')
  closeLogin() {
    this.loginOpen.set(false);
  }

  toggleLogin(e: Event) {
    e.stopPropagation();
    this.loginOpen.update(v => !v);
  }
}
