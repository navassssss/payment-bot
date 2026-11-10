export interface Product {
  id: string;
  name: string;
  description: string | null;
  price_stars: number;
  telegram_file_id: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  product_id: string;
  telegram_user_id: number;
  telegram_charge_id: string;
  amount_stars: number;
  created_at: string;
  products?: Product;
  purchases?: Purchase | null;
}

export interface Purchase {
  id: string;
  product_id: string;
  payment_id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  purchased_at: string;
  products?: Product;
  payments?: Payment;
}

export interface Refund {
  id: string;
  payment_id: string;
  telegram_user_id: number;
  telegram_charge_id: string;
  amount_stars: number;
  reason: string | null;
  refunded_at: string;
  payments?: Payment;
  products?: Product;
}
