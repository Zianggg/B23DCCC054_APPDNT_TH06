import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Avatar from './Avatar';
import PressableScale from './PressableScale';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  avatarUid: string;
  title: string;
  status: string;
  online?: boolean; // undefined: không hiện chấm online (nhóm)
  highlight?: boolean; // "đang soạn tin…" hiện nổi bật hơn
  onBack: () => void;
  onPressTitle?: () => void; // nhóm: mở thông tin nhóm
  onSearch?: () => void; // tìm tin nhắn trong cuộc trò chuyện
};

export default function ChatHeader({
  avatarUid,
  title,
  status,
  online,
  highlight,
  onBack,
  onPressTitle,
  onSearch,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <PressableScale
        onPress={onBack}
        hitSlop={8}
        style={styles.back}
        accessibilityLabel="Quay lại"
      >
        <Icon name="arrow-left" size={24} color={colors.onPrimary} />
      </PressableScale>
      {/* PressableScale chỉ áp style cho phần bên trong, nên bọc View flex: 1 để chiếm chỗ */}
      <View style={styles.titleWrap}>
        <PressableScale
          style={styles.titleArea}
          onPress={onPressTitle}
          disabled={!onPressTitle}
          scaleTo={0.98}
          accessibilityRole={onPressTitle ? 'button' : undefined}
          accessibilityLabel={
            onPressTitle ? `${title}, xem thông tin nhóm` : undefined
          }
        >
          <Avatar
            uid={avatarUid}
            name={title}
            size={44}
            online={online}
            ringColor={colors.primary}
          />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            <Text
              style={[styles.status, highlight && styles.highlight]}
              numberOfLines={1}
            >
              {status}
            </Text>
          </View>
        </PressableScale>
      </View>
      {onSearch && (
        <PressableScale
          onPress={onSearch}
          hitSlop={8}
          style={styles.back}
          accessibilityLabel="Tìm tin nhắn"
        >
          <Icon name="magnify" size={24} color={colors.onPrimary} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1 },
  titleArea: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1 },
  name: {
    fontSize: font.title + 2,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  status: {
    fontSize: font.small + 1,
    color: colors.onPrimaryMuted,
    marginTop: 1,
  },
  highlight: {
    color: colors.onPrimary,
    fontStyle: 'italic',
    fontWeight: '700',
  },
});
