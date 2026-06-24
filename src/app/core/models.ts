export type Provider = 'Microsoft' | 'Google';
export type View = 'store' | 'admin' | 'account';
export type AdminSection = 'dashboard' | 'products' | 'ledger' | 'users' | 'suggestions';

export type Product = {
  id: number;
  name: string;
  category: string;
  description: string;
  unit: string;
  price: number;
  stock: number;
  rating: number;
  votes: number;
  image: string;
  barcode: string;
};

export type CartItem = Product & {
  quantity: number;
};

export type Suggestion = {
  id: number;
  name: string;
  reason: string;
  status: 'Pendiente' | 'Aprobada' | 'Rechazada';
};

export type PaymentMode = 'Pagado al momento' | 'Fin de mes';

export type ConsumptionItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ConsumptionRecord = {
  id: string;
  employee: string;
  employeeEmail: string;
  date: string;
  month: string;
  paymentMode: PaymentMode;
  paid: boolean;
  items: number;
  total: number;
  detail: ConsumptionItem[];
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: 'Admin' | 'Trabajador' | 'Caja';
  status: 'Activo' | 'Bloqueado';
};
