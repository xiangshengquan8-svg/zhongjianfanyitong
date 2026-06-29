import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useFocusEffect } from 'expo-router';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

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

export default function HistoryScreen() {
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
       * Query 参数：page?: number, limit?: number
       */
      const response = await fetch(
        `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/translate/history?page=${pageNum}&limit=20`
      );

      if (!response.ok) {
        throw new Error('获取历史记录失败');
      }

      const data = await response.json();

      if (isRefresh) {
        setItems(data.items);
      } else {
        setItems(prev => [...prev, ...data.items]);
      }

      setHasMore(data.items.length >= 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Fetch history error:', error);
      if (pageNum === 1) {
        Alert.alert('错误', '获取翻译历史失败');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory(1, true);
    }, [fetchHistory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory(1, true);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchHistory(page + 1);
  };

  const deleteItem = async (id: number) => {
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
             */
            const response = await fetch(
              `${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/translate/history/${id}`,
              { method: 'DELETE' }
            );

            if (!response.ok) {
              throw new Error('删除失败');
            }

            setItems(prev => prev.filter(item => item.id !== id));
          } catch (error) {
            console.error('Delete error:', error);
            Alert.alert('错误', '删除失败，请重试');
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const renderItem = useCallback(({ item }: { item: TranslationItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.langDirection}>
          <Text style={styles.langTag}>{LANG_LABELS[item.source_lang]}</Text>
          <FontAwesome6 name="arrow-right" size={10} color="#94A3B8" style={styles.arrow} />
          <Text style={styles.langTag}>{LANG_LABELS[item.target_lang]}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
          <TouchableOpacity
            onPress={() => deleteItem(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome6 name="trash-can" size={14} color="#CBD5E1" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.textSection}>
        <Text style={styles.sourceText} numberOfLines={2}>{item.source_text}</Text>
        <Text style={styles.translatedText} numberOfLines={2}>{item.translated_text}</Text>
      </View>
    </View>
  ), []);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <FontAwesome6 name="clock-rotate-left" size={32} color="#CBD5E1" />
        </View>
        <Text style={styles.emptyText}>暂无翻译记录</Text>
        <Text style={styles.emptySubtext}>完成翻译后，记录会自动保存在这里</Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#5B6AF7" />
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>翻译历史</Text>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#5B6AF7" />
          </View>
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={renderFooter}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F0F5',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 20 : 8,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },

  // Card
  card: {
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  langDirection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  langTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6AF7',
    backgroundColor: 'rgba(91,106,247,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  arrow: {
    marginHorizontal: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
    marginRight: 12,
  },
  textSection: {
    gap: 8,
  },
  sourceText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  translatedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 22,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(203,213,225,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Footer
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
