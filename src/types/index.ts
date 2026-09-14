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
}

export interface Purchase {
  id: string;
  product_id: string;
  payment_id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  purchased_at: string;
}
