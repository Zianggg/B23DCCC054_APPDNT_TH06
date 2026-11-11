import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import PressableScale from '../components/PressableScale';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import {
  AppNotification,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationType,
} from '../services/notificationService';
import { directConvId } from '../services/chatService';
import { useNow } from '../hooks/useTyping';
import { formatAgo } from '../utils/formatTime';
import { AppStackParamList, MainTabParamList } from '../navigation/types';
import { colors, font, radius, spacing } from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Notifications'>,
  NativeStackNavigationProp<AppStackParamList>
>;

const ICONS: Record<NotificationType, { icon: string; title: string }> = {
  message: { icon: 'message-text', title: 'Tin nhắn mới' },
  group_added: { icon: 'account-group', title: 'Được thêm vào nhóm' },
  reaction: { icon: 'emoticon-happy-outline', title: 'Cảm xúc mới' },
};

function NotificationCard({ item, now, onPress }: { item: AppNotification; now: number; onPress: () => void }) {
  const meta = ICONS[item.type] ?? ICONS.message;
  return (
    <PressableScale
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}. ${item.text}${item.read ? '' : '. Chưa đọc'}`}>
      <View style={[styles.iconWrap, !item.read && styles.iconUnread]}>
        <Icon name={meta.icon} size={22} color={item.read ? colors.primary : colors.onPrimary} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, !item.read && styles.titleUnread]}>{meta.title}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.text}
        </Text>
        <Text style={styles.time}>{formatAgo(item.createdAt, now)}</Text>
      </View>
      {!item.read && <View style={styles.dot} />}
    </PressableScale>
  );
}

export default function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const myUid = useAuth().user?.uid ?? '';
  const { notifications, unreadNotifications, conversations } = useChats();
  const now = useNow(60000);

  // Nhấn thông báo: đánh dấu đã đọc rồi mở đúng cuộc trò chuyện
  const open = (n: AppNotification) => {
    if (!n.read) {
      markNotificationRead(myUid, n.id).catch(() => {});
    }
    const conv = conversations[n.convId];
    const isDirect = conv ? conv.type === 'direct' : n.convId === directConvId(myUid, n.fromUid);
    navigation.navigate('Chat', { convId: n.convId, otherUid: isDirect ? n.fromUid : undefined });
  };

  const markAll = () =>
    markAllNotificationsRead(myUid, notifications).catch(() => Alert.alert('Lỗi', 'Không cập nhật được thông báo'));

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="Thông báo"
        subtitle={unreadNotifications > 0 ? `${unreadNotifications} thông báo chưa đọc` : 'Bạn đã xem hết thông báo'}>
        <PressableScale
          style={[styles.markAll, unreadNotifications === 0 && styles.markAllOff]}
          onPress={markAll}
          disabled={unreadNotifications === 0}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel="Đánh dấu tất cả đã đọc">
          <Icon name="check-all" size={20} color={colors.primary} />
          <Text style={styles.markAllText}>Đánh dấu tất cả đã đọc</Text>
        </PressableScale>
      </ScreenHeader>
      <FlatList
        data={notifications}
        keyExtractor={n => n.id}
        renderItem={({ item }) => <NotificationCard item={item} now={now} onPress={() => open(item)} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState icon="bell-outline" title="Chưa có thông báo nào" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  markAllOff: { opacity: 0.6 },
  markAllText: { color: colors.primary, fontWeight: '800', fontSize: font.body },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  cardUnread: { backgroundColor: colors.primarySoft },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.primary },
  info: { flex: 1 },
  title: { fontSize: font.body, fontWeight: '700', color: colors.text },
  titleUnread: { fontWeight: '900' },
  body: { fontSize: font.body, color: colors.textMuted, marginTop: 2, lineHeight: 20 },
  time: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.badge, marginTop: 6 },
});
