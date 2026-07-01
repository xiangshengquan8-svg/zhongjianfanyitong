import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

interface SupabaseConfigContextType {
  config: SupabaseConfig | null;
  isLoading: boolean;
  error: string | null;
}

const SupabaseConfigContext = createContext<SupabaseConfigContextType>({
  config: null,
  isLoading: true,
  error: null,
});

export const SUPABASE_CONFIG_READY_EVENT = 'supabase-config-ready';

// 直接嵌入 Supabase 配置，不依赖后端
const EMBEDDED_SUPABASE_CONFIG: SupabaseConfig = {
  url: 'https://br-happy-oryx-05747dcd.supabase2.aidap-global.cn-beijing.volces.com',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjMyNDY0ODksInJvbGUiOiJhbm9uIn0.dc1Wg3s9WsxmwinjQG1DjOAybC6HRHXPzn9bbtAl8Ck',
};

// Module-level config storage for RN environment
let moduleConfig: SupabaseConfig | null = EMBEDDED_SUPABASE_CONFIG;

export function getModuleConfig(): SupabaseConfig | null {
  return moduleConfig;
}

export function useSupabaseConfig() {
  return useContext(SupabaseConfigContext);
}

interface SupabaseConfigProviderProps {
  children: ReactNode;
}

export function SupabaseConfigProvider({ children }: SupabaseConfigProviderProps) {
  const [config, setConfig] = useState<SupabaseConfig | null>(EMBEDDED_SUPABASE_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 直接使用嵌入的配置，不需要从后端获取
    moduleConfig = EMBEDDED_SUPABASE_CONFIG;
    setConfig(EMBEDDED_SUPABASE_CONFIG);
    
    // Dispatch custom event for non-React consumers
    if (typeof window !== 'undefined') {
      (window as any).__SUPABASE_CONFIG__ = EMBEDDED_SUPABASE_CONFIG;
      window.dispatchEvent(new CustomEvent(SUPABASE_CONFIG_READY_EVENT, { detail: EMBEDDED_SUPABASE_CONFIG }));
    }
  }, []);

  return (
    <SupabaseConfigContext.Provider value={{ config, isLoading, error }}>
      {children}
    </SupabaseConfigContext.Provider>
  );
}
