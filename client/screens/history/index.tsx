import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';

const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1`;

interface TranslationItem {
  id: number;
  source_lang: string;
  target_lang: string;
  source_text: string;
  translated_text: string;
  audio_url: string | null;
  created_at: string;
}

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  km: '高棉语',
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const supabase = await getSupabaseBrowserClientWithRetry();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { 'x-session': session.access_token };
};

export default function HistoryScreen() {
  const router = useSafeRouter();
  const [items, setItems] = useState<TranslationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchHistory = useCallback(async (pageNum: number, isRefresh = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      /**
       * 服务端文件：server/src/routes/translate.ts
       * 接口：GET /api/v1/translate/history
       * Query 参数：page: number, limit: number
       * 需要 Header：x-session (access_token)
       */
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${API_BASE}/translate/history?page=${pageNum}&limit=20`,
        { headers }
      );

      if (response.status === 401) {
        router.replace('/login');
        return;
      }

      const data = await response.json();
      const newItems = data.items || [];

      if (pageNum === 1) {
        setItems(newItems);
      } else {
        setItems(prev => [...prev, ...newItems]);
      }

      setHasMore(newItems.length >= 20);
    } catch (error) {
      console.error('Fetch history error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory(1);
    }, [fetchHistory])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchHistory(1, true);
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHistory(nextPage);
  };

  const handleDelete = (id: number) => {
    Alert.alert('确认删除', '确定要删除这条翻译记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            /**
             * 服务端文件：server/src/routes/translate.ts
             * 接口：DELETE /api/v1/translate/history/:id
             * Path 参数：id: number
             * 需要 Header：x-session (access_token)
             */
            const headers = await getAuthHeaders();
            await fetch(`${API_BASE}/translate/history/${id}`, {
              method: 'DELETE',
              headers,
            });
            setItems(prev => prev.filter(item => item.id !== id));
          } catch (error) {
            console.error('Delete error:', error);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: TranslationItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.langPair}>
          <Text style={styles.langText}>{LANG_LABELS[item.source_lang] || item.source_lang}</Text>
          <FontAwesome6 name="arrow-right" size={10} color="#94A3B8" />
          <Text style={styles.langText}>{LANG_LABELS[item.target_lang] || item.target_lang}</Text>
        </View>
        <View style={styles.cardActions}>
          <Text style={styles.timeText}>
            {new Date(item.created_at).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
            <FontAwesome6 name="trash-can" size={14} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.sourceText} numberOfLines={2}>{item.source_text}</Text>
        <FontAwesome6 name="arrow-down" size={10} color="#CBD5E1" style={styles.arrowIcon} />
        <Text style={styles.translatedText} numberOfLines={2}>{item.translated_text}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#5B6AF7" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>翻译历史</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="chevron-left" size={18} color="#5B6AF7" />
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome6 name="clock-rotate-left" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>暂无翻译记录</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footer}>
                  <ActivityIndicator size="small" color="#5B6AF7" />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </Screen>
  );
}

const styles = {
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#1E293B',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#5B6AF710',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  langPair: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  langText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#5B6AF7',
  },
  cardActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  deleteBtn: {
    padding: 4,
  },
  cardBody: {
    gap: 6,
  },
  sourceText: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  arrowIcon: {
    alignSelf: 'center' as const,
    marginVertical: 2,
  },
  translatedText: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500' as const,
    lineHeight: 22,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#94A3B8',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
};
