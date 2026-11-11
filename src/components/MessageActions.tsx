import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { Message, Reaction, REACTIONS } from '../services/chatService';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  message: Message | null;
  mine: boolean;
  myReaction?: string;
  onClose: () => void;
  onReact: (emoji: Reaction) => void;
  onCopy: () => void;
  onRecall: () => void;
  onReply: () => void;
};

// Menu khi nhấn giữ một tin: thả cảm xúc, Sao chép, Thu hồi (chỉ tin của mình)
export default function MessageActions({
  message,
  mine,
  myReaction,
  onClose,
  onReact,
  onCopy,
  onRecall,
  onReply,
}: Props) {
  const canCopy = !!message && !message.recalled && message.type !== 'system';
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Đóng menu">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.reactions}>
            {REACTIONS.map(emoji => (
              <PressableScale
                key={emoji}
                style={[styles.emojiBtn, myReaction === emoji && styles.emojiActive]}
                onPress={() => onReact(emoji)}
                scaleTo={0.85}
                accessibilityLabel={`Thả cảm xúc ${emoji}`}>
                <Text style={styles.emoji}>{emoji}</Text>
              </PressableScale>
            ))}
          </View>
          {canCopy && (
            <PressableScale style={styles.action} onPress={onReply} scaleTo={0.98}>
              <Icon name="reply" size={22} color={colors.text} />
              <Text style={styles.actionText}>Trả lời</Text>
            </PressableScale>
          )}
          {canCopy && (
            <PressableScale style={styles.action} onPress={onCopy} scaleTo={0.98}>
              <Icon name="content-copy" size={22} color={colors.text} />
              <Text style={styles.actionText}>Sao chép</Text>
            </PressableScale>
          )}
          {mine && message && !message.recalled && (
            <PressableScale style={styles.action} onPress={onRecall} scaleTo={0.98}>
              <Icon name="undo-variant" size={22} color={colors.danger} />
              <Text style={[styles.actionText, styles.danger]}>Thu hồi</Text>
            </PressableScale>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiActive: { backgroundColor: colors.primarySoft },
  emoji: { fontSize: 30 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  actionText: { fontSize: font.title, color: colors.text, fontWeight: '600' },
  danger: { color: colors.danger },
});
