import { supabase } from './client';
import { Product, Payment, Purchase } from '../types';

export const productQueries = {
  async getActiveProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getAllProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is no rows returned
    return data;
  },

  async createProduct(product: Partial<Product>): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
};

export const paymentQueries = {
  async createPayment(payment: Partial<Payment>): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .insert(payment)
      .select()
      .single();
    
    if (error) {
      // Check for unique violation on telegram_charge_id (code 23505)
      if (error.code === '23505') {
         const existing = await this.getPaymentByChargeId(payment.telegram_charge_id!);
         if (existing) return existing;
      }
      throw error;
    }
    return data;
  },

  async getPaymentByChargeId(chargeId: string): Promise<Payment | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('telegram_charge_id', chargeId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
};

export const purchaseQueries = {
  async createPurchase(purchase: Partial<Purchase>): Promise<Purchase> {
    const { data, error } = await supabase
      .from('purchases')
      .insert(purchase)
      .select()
      .single();
    
    if (error) {
       // Check if already purchased for this payment
       if (error.code === '23505') {
         const existing = await supabase
            .from('purchases')
            .select('*')
            .eq('payment_id', purchase.payment_id)
            .single();
         if (existing.data) return existing.data;
       }
       throw error;
    }
    return data;
  },

  async getPurchasesByUser(userId: number) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        products (*)
      `)
      .eq('telegram_user_id', userId)
      .order('purchased_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getBuyersByProduct(productId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        payments ( amount_stars )
      `)
      .eq('product_id', productId)
      .order('purchased_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getSalesStats() {
    const { data: purchases, error: purchaseErr } = await supabase.from('purchases').select('id', { count: 'exact' });
    const { data: payments, error: paymentErr } = await supabase.from('payments').select('amount_stars');
    
    if (purchaseErr) throw purchaseErr;
    if (paymentErr) throw paymentErr;

    const totalPurchases = purchases.length;
    const totalStars = payments.reduce((sum, p) => sum + p.amount_stars, 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayPayments, error: todayErr } = await supabase
      .from('payments')
      .select('amount_stars')
      .gte('created_at', todayStr + 'T00:00:00.000Z');
      
    if (todayErr) throw todayErr;
    
    const todayPurchases = todayPayments.length;
    const todayStars = todayPayments.reduce((sum, p) => sum + p.amount_stars, 0);

    return {
      totalPurchases,
      totalStars,
      todayPurchases,
      todayStars
    };
  }
};
