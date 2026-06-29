import { Router } from 'express';
import { getSupabaseCredentials } from '../storage/database/supabase-client.js';

const router = Router();

// GET /api/v1/supabase-config - 获取 Supabase 配置（供前端使用）
router.get('/', (_req, res) => {
  try {
    const { url, anonKey } = getSupabaseCredentials();
    if (!url || !anonKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }
    return res.json({ url, anonKey });
  } catch (error) {
    console.error('Failed to get Supabase config:', error);
    return res.status(500).json({ error: 'Failed to get Supabase config' });
  }
});

export default router;
