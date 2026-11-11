import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from './PressableScale';
import { Message, normalizeText, searchMessages } from '../services/chatService';
import { AppUser } from '../services/userService';
import { formatListTime } from '../utils/formatTime';
import { colors, font, radius, spacing } from '../theme';

type Props = {
  convId: string;
  myUid: string;
  users: Record<string, AppUser>;
  onSelect: (msg: Message) => void;
  onClose: () => void;
};

const DEBOUNCE_MS = 300;

// Tô đậm đoạn khớp từ khóa (so khớp không dấu nên tìm vị trí trên chuỗi đã bỏ dấu)
function Highlighted({ text, keyword }: { text: string; keyword: string }) {
  const q = normalizeText(keyword.trim());
  const at = q ? normalizeText(text).indexOf(q) : -1;
  if (at < 0) {
    return <Text style={styles.resultText}>{text}</Text>;
  }
  return (
    <Text style={styles.resultText} numberOfLines={2}>
      {text.slice(0, at)}
      <Text style={styles.match}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </Text>
  );
}

// Tìm kiếm nội dung tin nhắn trong một cuộc trò chuyện
export default function SearchPanel({ convId, myUid, users, onSelect, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!keyword.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchMessages(convId, keyword)
        .then(list => !cancelled && setResults(list))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [convId, keyword]);

  return (
    <View style={styles.panel}>
      <View style={styles.inputRow}>
        <Icon name="magnify" size={22} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="Tìm trong cuộc trò chuyện"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Từ khóa tìm kiếm"
        />
        {loading && <ActivityIndicator color={colors.primary} />}
        <PressableScale onPress={onClose} hitSlop={10} accessibilityLabel="Đóng tìm kiếm">
          <Text style={styles.close}>Đóng</Text>
        </PressableScale>
      </View>
      {!!keyword.trim() && !loading && (
        <Text style={styles.count}>
          {results.length > 0 ? `${results.length} kết quả` : 'Không tìm thấy tin nhắn nào'}
        </Text>
      )}
      <FlatList
        data={results}
        keyExtractor={m => m.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <PressableScale style={styles.result} onPress={() => onSelect(item)} scaleTo={0.98}>
            <View style={styles.resultTop}>
              <Text style={styles.sender} numberOfLines={1}>
                {item.senderId === myUid ? 'Bạn' : users[item.senderId]?.name ?? 'Thành viên'}
              </Text>
              <Text style={styles.time}>{formatListTime(item.createdAt)}</Text>
            </View>
            <Highlighted text={item.text ?? ''} keyword={keyword} />
          </PressableScale>
        )}
        ItemSeparatorComponent={Separator}
      />
    </View>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    paddingHorizontal: spacing.lg,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: font.body + 1, color: colors.text },
  close: { color: colors.primary, fontWeight: '800', fontSize: font.body },
  count: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, color: colors.textMuted, fontSize: font.small + 1 },
  result: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  resultTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  sender: { flex: 1, fontWeight: '800', color: colors.text, fontSize: font.body },
  time: { color: colors.textMuted, fontSize: font.small },
  resultText: { color: colors.textMuted, fontSize: font.body, marginTop: 2 },
  match: { color: colors.text, fontWeight: '800', backgroundColor: 'rgba(199,123,18,0.25)' },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
});
