import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { colors, font, spacing } from '../theme';

type Props = { name: string; preview: string; onCancel: () => void };

// Thanh "Đang trả lời ..." phía trên ô nhập tin
export default function ReplyBar({ name, preview, onCancel }: Props) {
  return (
    <View style={styles.bar}>
      <Icon name="reply" size={20} color={colors.primary} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          Đang trả lời {name}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <PressableScale onPress={onCancel} hitSlop={10} accessibilityLabel="Hủy trả lời">
        <Icon name="close" size={20} color={colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  info: { flex: 1, borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: spacing.sm },
  title: { fontSize: font.small + 1, fontWeight: '800', color: colors.primary },
  preview: { fontSize: font.small + 1, color: colors.textMuted },
});
