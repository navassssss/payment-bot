import { supabase } from './client';
import { Product, Payment, Purchase, Refund } from '../types';

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
  },

  async getPaymentById(id: string): Promise<(Payment & { products?: Product; purchases?: Purchase | null }) | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*, products (*), purchases (*)')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getRecentPayments(limit = 10): Promise<(Payment & { products?: Product; purchases?: Purchase | null })[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*, products (*), purchases (*)')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  },

  async searchPayments(query: string): Promise<(Payment & { products?: Product; purchases?: Purchase | null })[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // 1. UUID check
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      const { data } = await supabase
        .from('payments')
        .select('*, products (*), purchases (*)')
        .eq('id', trimmed);
      if (data && data.length > 0) return data;
    }

    // 2. Charge ID check
    if (trimmed.startsWith('stx')) {
      const { data } = await supabase
        .from('payments')
        .select('*, products (*), purchases (*)')
        .eq('telegram_charge_id', trimmed);
      if (data && data.length > 0) return data;
    }

    // 3. User ID check (numeric)
    if (/^\d+$/.test(trimmed)) {
      const userId = Number(trimmed);
      const { data } = await supabase
        .from('payments')
        .select('*, products (*), purchases (*)')
        .eq('telegram_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data && data.length > 0) return data;
    }

    // 4. Username check
    const cleanUsername = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    const { data: purchaseMatches } = await supabase
      .from('purchases')
      .select('payment_id')
      .ilike('username', cleanUsername);
    
    if (purchaseMatches && purchaseMatches.length > 0) {
      const paymentIds = purchaseMatches.map(p => p.payment_id);
      const { data } = await supabase
        .from('payments')
        .select('*, products (*), purchases (*)')
        .in('id', paymentIds)
        .order('created_at', { ascending: false });
      if (data && data.length > 0) return data;
    }

    return [];
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

  async getPurchasesByUser(userId: number): Promise<(Purchase & { products?: Product; payments?: Payment })[]> {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        products (*),
        payments (*)
      `)
      .eq('telegram_user_id', userId)
      .order('purchased_at', { ascending: false });
    
    if (error) throw error;
    return (data as any) || [];
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

    const totalPurchases = purchases?.length || 0;
    const totalStars = payments?.reduce((sum, p) => sum + p.amount_stars, 0) || 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayPayments, error: todayErr } = await supabase
      .from('payments')
      .select('amount_stars')
      .gte('created_at', todayStr + 'T00:00:00.000Z');
      
    if (todayErr) throw todayErr;
    
    const todayPurchases = todayPayments?.length || 0;
    const todayStars = todayPayments?.reduce((sum, p) => sum + p.amount_stars, 0) || 0;

    // Check refunds
    let totalRefundsCount = 0;
    let totalRefundedStars = 0;
    let todayRefundsCount = 0;
    let todayRefundedStars = 0;

    try {
      const { data: refunds, error: rErr } = await supabase.from('refunds').select('amount_stars, refunded_at');
      if (!rErr && refunds && refunds.length > 0) {
        totalRefundsCount = refunds.length;
        totalRefundedStars = refunds.reduce((sum, r) => sum + r.amount_stars, 0);
        const todayRefunds = refunds.filter(r => r.refunded_at >= todayStr + 'T00:00:00.000Z');
        todayRefundsCount = todayRefunds.length;
        todayRefundedStars = todayRefunds.reduce((sum, r) => sum + r.amount_stars, 0);
      } else {
        // Fallback if refunds table empty or doesn't exist
        const { data: allP } = await supabase.from('payments').select('amount_stars, created_at, purchases(*)');
        if (allP) {
          const ref = allP.filter(p => !p.purchases || (Array.isArray(p.purchases) && p.purchases.length === 0));
          totalRefundsCount = ref.length;
          totalRefundedStars = ref.reduce((sum, r) => sum + r.amount_stars, 0);
          const todayR = ref.filter(r => r.created_at >= todayStr + 'T00:00:00.000Z');
          todayRefundsCount = todayR.length;
          todayRefundedStars = todayR.reduce((sum, r) => sum + r.amount_stars, 0);
        }
      }
    } catch {
      // Ignored fallback
    }

    return {
      totalPurchases,
      totalStars,
      totalRefundsCount,
      totalRefundedStars,
      netStars: totalStars - totalRefundedStars,
      todayPurchases,
      todayStars,
      todayRefundsCount,
      todayRefundedStars,
      todayNetStars: todayStars - todayRefundedStars
    };
  }
};

export const refundQueries = {
  async recordRefund(refund: {
    payment_id: string;
    telegram_user_id: number;
    telegram_charge_id: string;
    amount_stars: number;
    reason?: string;
  }): Promise<void> {
    // 1. Attempt to insert into refunds table if it exists
    try {
      const { error } = await supabase
        .from('refunds')
        .insert({
          payment_id: refund.payment_id,
          telegram_user_id: refund.telegram_user_id,
          telegram_charge_id: refund.telegram_charge_id,
          amount_stars: refund.amount_stars,
          reason: refund.reason || 'Admin manual refund'
        });
      if (error && error.code !== 'PGRST205') {
        console.error("Error inserting into refunds table:", error);
      }
    } catch (err) {
      console.warn("Refunds table insert skipped:", err);
    }

    // 2. Delete purchase record so user loses file access in /purchases
    const { error: delError } = await supabase
      .from('purchases')
      .delete()
      .eq('payment_id', refund.payment_id);
    
    if (delError) {
      console.error("Error deleting purchase for refunded payment:", delError);
    }
  },

  async isRefunded(paymentId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('refunds')
        .select('id')
        .eq('payment_id', paymentId)
        .single();
      if (!error && data) return true;
    } catch {
      // Ignore
    }

    // Check if purchase is missing for this payment
    const { data: purchase } = await supabase
      .from('purchases')
      .select('id')
      .eq('payment_id', paymentId)
      .single();

    return !purchase;
  },

  async getRefunds(limit = 20): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('refunds')
        .select('*, payments (*, products (*))')
        .order('refunded_at', { ascending: false })
        .limit(limit);
      
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch {
      // Table may not exist yet
    }

    // Fallback: payments without active purchases
    const { data: payments } = await supabase
      .from('payments')
      .select('*, products (*), purchases (*)')
      .order('created_at', { ascending: false });
    
    if (!payments) return [];

    const refundedPayments = payments
      .filter(p => !p.purchases || (Array.isArray(p.purchases) && p.purchases.length === 0))
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        payment_id: p.id,
        telegram_user_id: p.telegram_user_id,
        telegram_charge_id: p.telegram_charge_id,
        amount_stars: p.amount_stars,
        reason: 'Refunded',
        refunded_at: p.created_at,
        payments: p
      }));

    return refundedPayments;
  }
};

export const refundRequestQueries = {
  async createRequest(req: {
    payment_id: string;
    telegram_user_id: number;
    product_id: string;
    reason: string | null;
  }) {
    try {
      const { data, error } = await supabase
        .from('refund_requests')
        .insert({
          payment_id: req.payment_id,
          telegram_user_id: req.telegram_user_id,
          product_id: req.product_id,
          reason: req.reason,
          status: 'pending'
        })
        .select()
        .single();
      if (!error && data) return data;
    } catch {
      // Table may not exist yet
    }
    return null;
  },

  async getPendingByPaymentId(paymentId: string) {
    try {
      const { data, error } = await supabase
        .from('refund_requests')
        .select('*')
        .eq('payment_id', paymentId)
        .eq('status', 'pending')
        .single();
      if (!error && data) return data;
    } catch {
      // Ignore
    }
    return null;
  },

  async updateStatus(paymentId: string, status: 'approved' | 'declined') {
    try {
      await supabase
        .from('refund_requests')
        .update({
          status,
          reviewed_at: new Date().toISOString()
        })
        .eq('payment_id', paymentId);
    } catch {
      // Ignore
    }
  }
};
