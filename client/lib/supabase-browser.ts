import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getModuleConfig, SUPABASE_CONFIG_READY_EVENT } from './supabase-config-inject';

let browserClient: SupabaseClient | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForConfig(maxWait = 5000): Promise<boolean> {
  const config = getModuleConfig();
  if (config?.url && config?.anonKey) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let resolved = false;

    const handler = () => {
      if (!resolved) {
        resolved = true;
        if (typeof window !== 'undefined') {
          window.removeEventListener(SUPABASE_CONFIG_READY_EVENT, handler);
        }
        resolve(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(SUPABASE_CONFIG_READY_EVENT, handler);
    }

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (typeof window !== 'undefined') {
          window.removeEventListener(SUPABASE_CONFIG_READY_EVENT, handler);
        }
        const c = getModuleConfig();
        resolve(!!(c?.url && c?.anonKey));
      }
    }, maxWait);
  });
}

function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient === null) {
    const config = getModuleConfig();
    if (!config || !config.url || !config.anonKey) {
      throw new Error(
        'Supabase config not found. Make sure SupabaseConfigProvider is included in your layout.'
      );
    }
    browserClient = createClient(config.url, config.anonKey, {
      db: { timeout: 60000 },
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return browserClient;
}

async function getSupabaseBrowserClientWithRetry(
  maxRetries = 5,
  retryInterval = 1000
): Promise<SupabaseClient> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return getSupabaseBrowserClient();
    } catch {
      if (i < maxRetries - 1) {
        await sleep(retryInterval);
      }
    }
  }
  return getSupabaseBrowserClient();
}

async function getSupabaseBrowserClientAsync(): Promise<SupabaseClient> {
  if (browserClient !== null) return browserClient;
  const ready = await waitForConfig();
  if (!ready) {
    throw new Error('Supabase config not found after waiting.');
  }
  return getSupabaseBrowserClient();
}

export {
  getSupabaseBrowserClient,
  getSupabaseBrowserClientWithRetry,
  getSupabaseBrowserClientAsync,
  waitForConfig,
};
