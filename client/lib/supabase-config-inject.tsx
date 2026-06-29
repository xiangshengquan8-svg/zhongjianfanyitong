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

// Module-level config storage for RN environment
let moduleConfig: SupabaseConfig | null = null;

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
  const [config, setConfig] = useState<SupabaseConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/supabase-config`;
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.url && data.anonKey) {
          setConfig(data);
          moduleConfig = data;
          // Dispatch custom event for non-React consumers
          if (typeof window !== 'undefined') {
            (window as any).__SUPABASE_CONFIG__ = data;
            window.dispatchEvent(new CustomEvent(SUPABASE_CONFIG_READY_EVENT, { detail: data }));
          }
        } else {
          throw new Error('Invalid config response');
        }
      })
      .catch((err) => {
        setError(err.message);
        console.error('Failed to load Supabase config:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <SupabaseConfigContext.Provider value={{ config, isLoading, error }}>
      {children}
    </SupabaseConfigContext.Provider>
  );
}
