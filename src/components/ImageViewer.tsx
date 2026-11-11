import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';

type Props = { url: string | null; onClose: () => void };

// Xem ảnh toàn màn hình (ảnh gốc, không phải ảnh thu nhỏ)
export default function ImageViewer({ url, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  useEffect(() => setLoading(true), [url]);

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        {url && (
          <Image
            key={url}
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        )}
        {loading && <ActivityIndicator size="large" color="#fff" />}
        {/* Pressable nằm trong View định vị tuyệt đối để luôn nổi trên ảnh */}
        <View style={[styles.closeWrap, { top: insets.top + 12 }]}>
          <PressableScale style={styles.close} onPress={onClose} accessibilityLabel="Đóng ảnh">
            <Icon name="close" size={26} color="#fff" />
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  closeWrap: { position: 'absolute', right: 16 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
