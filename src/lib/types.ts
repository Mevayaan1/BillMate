export interface Settings {
  id: 1;
  shop_name: string;
  address: string;
  phone: string;
  gstin: string;
  state_code: string;
  logo_url: string | null;
  invoice_prefix: string;
  next_invoice_no: number;
  prices_include_tax: boolean;
  gst_enabled: boolean;
  footer_note: string;
  setup_done: boolean;
}

export interface Category { id: string; name: string }

export interface Variant {
  id: string;
  product_id: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
  sale_price: number;
  mrp: number | null;
  low_stock_limit: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  hsn: string;
  gst_rate: number;
  unit: string;
  has_variants: boolean;
  active: boolean;
  variants: Variant[];
}

export interface Party {
  id: string;
  type: "customer" | "supplier" | "both";
  name: string;
  phone: string;
  gstin: string;
  state_code: string;
  address: string;
}

export interface InvoiceItem {
  id: string;
  name: string;
  hsn: string;
  unit: string;
  qty: number;
  unit_price: number;
  discount: number;
  gst_rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  date: string;
  party_id: string | null;
  customer_name: string;
  place_of_supply: string;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  discount_total: number;
  round_off: number;
  grand_total: number;
  paid: number;
  payment_mode: "cash" | "upi" | "card" | "credit";
  status: "final" | "cancelled";
  note: string;
  invoice_items?: InvoiceItem[];
}

export interface CartLine {
  variantId: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  stock: number;
}

export interface Payment {
  id: string;
  invoice_id: string | null;
  party_id: string | null;
  amount: number;
  mode: string;
  date: string;
}
