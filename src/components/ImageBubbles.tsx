import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { thumbnailUrl } from '../services/uploadService';
import { colors, font, radius, spacing } from '../theme';

const MAX_W = 240;
const MAX_H = 320;

// Giữ đúng tỉ lệ ảnh, giới hạn trong khung 240 x 320
export function bubbleSize(width?: number, height?: number) {
  if (!width || !height) {
    return { width: MAX_W, height: MAX_W };
  }
  const scale = Math.min(MAX_W / width, MAX_H / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

type ImageProps = {
  url: string;
  width?: number;
  height?: number;
  mine: boolean;
  time: string;
  onOpen: () => void;
  onLongPress?: () => void;
};

export function ImageMessage({ url, width, height, mine, time, onOpen, onLongPress }: ImageProps) {
  const size = bubbleSize(width, height);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="imagebutton"
      accessibilityLabel="Ảnh, nhấn để xem toàn màn hình"
      style={[styles.frame, size, mine ? styles.tailMine : styles.tailOther]}>
      <Image
        source={{ uri: thumbnailUrl(url) }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
      />
      {loading && !failed && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} />}
      {failed && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Icon name="image-broken-variant" size={36} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.time}>{time}</Text>
    </Pressable>
  );
}

type PendingProps = {
  uri: string;
  width?: number;
  height?: number;
  status: 'uploading' | 'error';
  progress: number;
  onRetry: () => void;
  onCancel: () => void;
};

// Bong bóng tạm trong lúc tải ảnh lên Cloudinary
export function PendingImage({ uri, width, height, status, progress, onRetry, onCancel }: PendingProps) {
  const size = bubbleSize(width, height);
  return (
    <View style={styles.pendingRow}>
      <View style={[styles.frame, size, styles.tailMine]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, styles.overlay, styles.center]}>
          {status === 'uploading' ? (
            <>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.overlayText}>Đang tải lên {Math.round(progress * 100)}%</Text>
            </>
          ) : (
            <>
              <Icon name="alert-circle-outline" size={32} color="#fff" />
              <Text style={styles.overlayText}>Tải ảnh lên thất bại</Text>
              <View style={styles.actions}>
                <PressableScale style={styles.retry} onPress={onRetry} accessibilityLabel="Thử lại">
                  <Icon name="refresh" size={18} color={colors.primary} />
                  <Text style={styles.retryText}>Thử lại</Text>
                </PressableScale>
                <PressableScale style={styles.cancel} onPress={onCancel} accessibilityLabel="Bỏ ảnh">
                  <Icon name="close" size={18} color="#fff" />
                </PressableScale>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xl - 6,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  tailMine: { borderBottomRightRadius: 6 },
  tailOther: { borderBottomLeftRadius: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  time: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.xs,
    fontSize: 11,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  pendingRow: { paddingHorizontal: spacing.md, marginVertical: 3, alignItems: 'flex-end' },
  overlay: { backgroundColor: 'rgba(0,0,0,0.45)', gap: spacing.sm, padding: spacing.md },
  overlayText: { color: '#fff', fontSize: font.small + 1, fontWeight: '700', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  retryText: { color: colors.primary, fontWeight: '800', fontSize: font.body },
  cancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
