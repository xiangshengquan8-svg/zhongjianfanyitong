import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { SupabaseConfigProvider } from '@/lib/supabase-config-inject';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/i18n/I18nContext';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

export default function RootLayout() {
  return (
    <Provider>
      <SupabaseConfigProvider>
        <I18nProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                animation: 'slide_from_right',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false
              }}
            >
              <Stack.Screen name="login" options={{ title: "" }} />
              <Stack.Screen name="index" options={{ title: "" }} />
              <Stack.Screen name="history" options={{ title: "" }} />
            </Stack>
            <Toast />
          </AuthProvider>
        </I18nProvider>
      </SupabaseConfigProvider>
    </Provider>
  );
}
