import React, { useEffect, useRef } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { ImageMessage } from './ImageBubbles';
import { Message, RECALLED_TEXT, summarizeReactions } from '../services/chatService';
import { formatMessageTime } from '../utils/formatTime';
import { getMapsUrl } from '../utils/mapsUrl';
import { easeOut, useReduceMotion } from '../hooks/useReduceMotion';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  message: Message;
  mine: boolean;
  animateIn?: boolean;
  senderName?: string; // chat nhóm: tên người gửi phía trên bong bóng
  footer?: React.ReactNode; // "Đã gửi" / "Đã xem" dưới tin cuối của mình
  myUid?: string;
  onLongPress?: () => void; // mở menu Sao chép / Thu hồi / cảm xúc
  onOpenImage?: (url: string) => void; // nhấn ảnh để xem toàn màn hình
  replyName?: string; // tên người gửi tin được trích dẫn
  replyPreview?: string; // nội dung trích dẫn (đã tính tới trường hợp tin gốc bị thu hồi)
  onPressReply?: () => void; // cuộn tới tin gốc
  highlighted?: boolean; // vừa nhảy tới từ trích dẫn / tìm kiếm
};

const LONG_PRESS_MS = 300;

export default function MessageBubble({
  message,
  mine,
  animateIn,
  senderName,
  footer,
  myUid = '',
  onLongPress,
  onOpenImage,
  replyName,
  replyPreview,
  onPressReply,
  highlighted,
}: Props) {
  const time = formatMessageTime(message.createdAt);
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(animateIn ? 0 : 1)).current;

  // Tin mới bay vào từ phía người gửi; tin cũ khi mở màn thì hiện sẵn
  useEffect(() => {
    if (animateIn) {
      Animated.timing(enter, {
        toValue: 1,
        duration: reduce ? 160 : 420,
        easing: easeOut,
        useNativeDriver: true,
      }).start();
    }
  }, [animateIn, enter, reduce]);

  const reactions = summarizeReactions(message.reactions, myUid);

  const motion = {
    opacity: enter,
    transform: reduce
      ? []
      : [
          { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [mine ? 36 : -36, 0] }) },
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
  };


  if (message.type === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const withMeta = (bubble: React.ReactNode) => (
    <Animated.View
      style={[styles.wrap, mine ? styles.wrapRight : styles.wrapLeft, highlighted && styles.highlight, motion]}>
      {senderName ? <Text style={styles.sender}>{senderName}</Text> : null}
      <View style={[styles.rowInner, mine ? styles.right : styles.left]}>{bubble}</View>
      {reactions.length > 0 && (
        <View style={[styles.reactionRow, mine ? styles.right : styles.left]}>
          {reactions.map(r => (
            <View key={r.emoji} style={[styles.reactionChip, r.mine && styles.reactionMine]}>
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
            </View>
          ))}
        </View>
      )}
      {footer}
    </Animated.View>
  );

  if (message.recalled) {
    return withMeta(
      <View style={[styles.bubble, styles.recalled]}>
        <Text style={styles.recalledText}>{RECALLED_TEXT}</Text>
        <Text style={[styles.time, styles.timeDark]}>{time}</Text>
      </View>,
    );
  }

  if (message.type === 'image' && message.imageUrl) {
    const url = message.imageUrl;
    return withMeta(
      <ImageMessage
        url={url}
        width={message.width}
        height={message.height}
        mine={mine}
        time={time}
        onOpen={() => onOpenImage?.(url)}
        onLongPress={onLongPress}
      />,
    );
  }

  if (message.type === 'location' && message.lat !== undefined && message.lng !== undefined) {
    const { lat, lng } = message;
    return withMeta(
        <PressableScale
          style={[styles.location, mine ? styles.tailMine : styles.tailOther]}
          onPress={() => Linking.openURL(getMapsUrl(lat, lng)).catch(() => {})}
          onLongPress={onLongPress}
          delayLongPress={LONG_PRESS_MS}
          scaleTo={0.97}
          accessibilityRole="link"
          accessibilityLabel="Mở vị trí trên Google Maps">
          <View style={styles.pin}>
            <Icon name="map-marker" size={28} color="#fff" />
          </View>
          <View style={styles.locationInfo}>
            <Text style={styles.locationTitle}>Vị trí hiện tại</Text>
            <Text style={styles.coords}>
              {lat.toFixed(4)}, {lng.toFixed(4)}
            </Text>
            <View style={styles.openRow}>
              <Text style={styles.hint}>Mở Google Maps</Text>
              <Icon name="arrow-top-right" size={14} color={colors.locationAccent} />
            </View>
          </View>
          <Text style={[styles.time, styles.timeDark, styles.locationTime]}>{time}</Text>
        </PressableScale>,
    );
  }

  return withMeta(
    <Pressable
      style={[styles.bubble, mine ? styles.mine : styles.other]}
      onLongPress={onLongPress}
      delayLongPress={LONG_PRESS_MS}
      accessibilityHint="Nhấn giữ để mở menu">
      {message.replyTo && (
        <Pressable
          style={[styles.quote, mine ? styles.quoteMine : styles.quoteOther]}
          onPress={onPressReply}
          accessibilityRole="button"
          accessibilityLabel={`Trích dẫn tin của ${replyName ?? 'thành viên'}, nhấn để xem tin gốc`}>
          <Text style={[styles.quoteName, mine && styles.textMine]} numberOfLines={1}>
            {replyName ?? 'Thành viên'}
          </Text>
          <Text style={[styles.quoteText, mine && styles.quoteTextMine]} numberOfLines={2}>
            {replyPreview ?? message.replyTo.preview}
          </Text>
        </Pressable>
      )}
      <Text style={[styles.text, mine && styles.textMine]}>{message.text}</Text>
      <Text style={[styles.time, mine ? styles.timeMine : styles.timeDark]}>{time}</Text>
    </Pressable>,
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.md, paddingVertical: 3 },
  highlight: { backgroundColor: 'rgba(199,123,18,0.18)' },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: 6,
  },
  quoteMine: { borderLeftColor: colors.onPrimary, backgroundColor: 'rgba(255,255,255,0.16)' },
  quoteOther: { borderLeftColor: colors.primary, backgroundColor: colors.primarySoft },
  quoteName: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  quoteText: { fontSize: font.small + 1, color: colors.textMuted },
  quoteTextMine: { color: colors.onPrimaryMuted },
  reactionRow: { flexDirection: 'row', width: '100%', gap: 4, marginTop: -6, paddingHorizontal: spacing.sm },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionMine: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '700', color: colors.text },
  wrapRight: { alignItems: 'flex-end' },
  wrapLeft: { alignItems: 'flex-start' },
  rowInner: { flexDirection: 'row', width: '100%' },
  sender: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginLeft: spacing.sm, marginBottom: 2 },
  systemRow: { alignItems: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.xl },
  systemText: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
  recalled: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  recalledText: { fontSize: font.body, color: colors.textMuted, fontStyle: 'italic' },
  right: { justifyContent: 'flex-end' },
  left: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg - 2,
    paddingTop: spacing.sm + 2,
    paddingBottom: 6,
    borderRadius: radius.xl - 6,
  },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  other: { backgroundColor: colors.bubbleOther, borderBottomLeftRadius: 6 },
  text: { fontSize: font.body + 1, color: colors.text, lineHeight: 22 },
  textMine: { color: colors.onPrimary },
  time: { fontSize: 11, marginTop: 2, alignSelf: 'flex-end' },
  timeMine: { color: colors.onPrimaryMuted },
  timeDark: { color: colors.textMuted },
  location: {
    width: 264,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl - 6,
    backgroundColor: colors.location,
    borderWidth: 1.5,
    borderColor: colors.locationAccent,
  },
  tailMine: { borderBottomRightRadius: 6 },
  tailOther: { borderBottomLeftRadius: 6 },
  pin: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.locationAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: { flex: 1 },
  locationTitle: { fontSize: font.title - 1, fontWeight: '800', color: colors.text },
  coords: { fontSize: font.small + 1, color: colors.text, marginTop: 2 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: spacing.xs },
  hint: { fontSize: font.small, color: colors.locationAccent, fontWeight: '800' },
  locationTime: { position: 'absolute', right: spacing.md, bottom: 6 },
});
