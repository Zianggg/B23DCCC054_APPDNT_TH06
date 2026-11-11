import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  onSend: (text: string) => Promise<void>;
  onSendLocation: () => Promise<void>;
  onTextChange?: (text: string) => void; // báo "đang soạn tin"
  onPickImage?: () => void; // nút 📷: chụp ảnh hoặc chọn từ thư viện
};

export default function ChatInput({ onSend, onSendLocation, onTextChange, onPickImage }: Props) {
  const [text, setTextState] = useState('');
  const setText = (value: string) => {
    setTextState(value);
    onTextChange?.(value);
  };
  const [sending, setSending] = useState(false);
  const [locating, setLocating] = useState(false);
  const canSend = text.trim().length > 0 && !sending;

  // Nút gửi "sáng" lên khi có nội dung
  const ready = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ready, { toValue: canSend ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [canSend, ready]);

  const send = async () => {
    if (!canSend) {
      return;
    }
    const value = text;
    setText('');
    setSending(true);
    try {
      await onSend(value);
    } catch {
      setText(value); // trả lại nội dung để người dùng gửi lại
    } finally {
      setSending(false);
    }
  };

  const sendLocation = async () => {
    setLocating(true);
    try {
      await onSendLocation();
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.bar}>
      <PressableScale
        style={styles.pinBtn}
        onPress={sendLocation}
        disabled={locating}
        scaleTo={0.88}
        accessibilityLabel="Gửi vị trí hiện tại">
        {locating ? (
          <ActivityIndicator color={colors.locationAccent} />
        ) : (
          <Text style={styles.pinIcon}>📍</Text>
        )}
      </PressableScale>
      {onPickImage && (
        <PressableScale
          style={styles.cameraBtn}
          onPress={onPickImage}
          scaleTo={0.88}
          accessibilityLabel="Gửi ảnh">
          <Text style={styles.pinIcon}>📷</Text>
        </PressableScale>
      )}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Nhập tin nhắn..."
        placeholderTextColor={colors.textMuted}
        multiline
      />
      <PressableScale onPress={send} disabled={!canSend} scaleTo={0.88} accessibilityLabel="Gửi tin nhắn">
        <Animated.View
          style={[
            styles.send,
            {
              backgroundColor: ready.interpolate({
                inputRange: [0, 1],
                outputRange: [colors.offline, colors.primary],
              }),
            },
          ]}>
          <Icon name="send" size={22} color="#fff" />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  pinBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.location,
    borderWidth: 1.5,
    borderColor: colors.locationAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinIcon: { fontSize: 22 },
  cameraBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: spacing.lg,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: radius.xl - 4,
    backgroundColor: colors.background,
    fontSize: font.body + 1,
    color: colors.text,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
