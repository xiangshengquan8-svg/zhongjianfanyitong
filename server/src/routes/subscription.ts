import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client.js';
import { subscriptions } from '../storage/database/shared/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Middleware: verify auth
async function verifyAuth(req: any, res: any, next: any) {
  const token = req.headers['x-session'];
  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }
  const client = getSupabaseClient(token);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: '认证失败' });
  }
  req.userId = user.id;
  next();
}

// GET /api/v1/subscription/status - 获取订阅状态
router.get('/status', verifyAuth, async (req: any, res) => {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      // No subscription record, create a free trial
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days
      const { data: newSub, error: insertError } = await client
        .from('subscriptions')
        .insert({
          user_id: req.userId,
          plan: 'free',
          status: 'trial',
          trial_start_at: now.toISOString(),
          trial_end_at: trialEnd.toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }

      return res.json({
        plan: 'free',
        status: 'trial',
        trial_end_at: trialEnd.toISOString(),
        is_valid: true,
      });
    }

    const sub = data[0];
    const now = new Date();
    let isValid = false;

    if (sub.status === 'trial') {
      isValid = new Date(sub.trial_end_at) > now;
    } else if (sub.status === 'active') {
      isValid = new Date(sub.subscription_end_at) > now;
    }

    return res.json({
      plan: sub.plan,
      status: sub.status,
      trial_end_at: sub.trial_end_at,
      subscription_end_at: sub.subscription_end_at,
      is_valid: isValid,
    });
  } catch (error: any) {
    console.error('Subscription status error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/subscription/activate - 激活订阅（模拟支付成功）
router.post('/activate', verifyAuth, async (req: any, res) => {
  try {
    const { plan } = req.body; // 'monthly' | 'yearly'
    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: '无效的订阅计划' });
    }

    const client = getSupabaseClient();
    const now = new Date();
    let endDate: Date;

    if (plan === 'monthly') {
      endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 1 month
    } else {
      endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
    }

    // Check if existing subscription
    const { data: existing } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing
      const { data: updated, error } = await client
        .from('subscriptions')
        .update({
          plan,
          status: 'active',
          subscription_start_at: now.toISOString(),
          subscription_end_at: endDate.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', existing[0].id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, subscription: updated });
    } else {
      // Create new
      const { data: newSub, error } = await client
        .from('subscriptions')
        .insert({
          user_id: req.userId,
          plan,
          status: 'active',
          subscription_start_at: now.toISOString(),
          subscription_end_at: endDate.toISOString(),
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, subscription: newSub });
    }
  } catch (error: any) {
    console.error('Subscription activate error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
