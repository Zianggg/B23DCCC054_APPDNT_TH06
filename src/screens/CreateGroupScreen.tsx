import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Avatar from '../components/Avatar';
import PressableScale from '../components/PressableScale';
import PrimaryButton from '../components/PrimaryButton';
import SearchBar from '../components/SearchBar';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import { filterContacts } from '../services/userService';
import { createGroup, MAX_GROUP_NAME, MIN_OTHER_MEMBERS, validateGroup } from '../services/groupService';
import { AppStackParamList } from '../navigation/types';
import { colors, font, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUid = user?.uid ?? '';
  const { userList, users } = useChats();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const contacts = useMemo(() => filterContacts(userList, myUid, query), [userList, myUid, query]);
  const toggle = (uid: string) =>
    setSelected(prev => (prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]));

  const error = validateGroup(name, selected);
  const missing = Math.max(0, MIN_OTHER_MEMBERS - selected.length);

  const onCreate = async () => {
    if (error) {
      Alert.alert('Chưa thể tạo nhóm', error);
      return;
    }
    setSaving(true);
    try {
      const myName = users[myUid]?.name || user?.displayName || 'Một người';
      const convId = await createGroup(myUid, myName, name, selected);
      navigation.replace('Chat', { convId });
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Lỗi', e?.message === 'OFFLINE' ? 'Không có kết nối mạng' : 'Không tạo được nhóm');
    }
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.barRow}>
          <PressableScale onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Quay lại">
            <Icon name="arrow-left" size={24} color={colors.onPrimary} />
          </PressableScale>
          <Text style={styles.title}>Tạo nhóm</Text>
        </View>
        <View style={styles.nameBox}>
          <Icon name="account-group" size={22} color={colors.primary} />
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Tên nhóm"
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_GROUP_NAME}
            accessibilityLabel="Tên nhóm"
          />
        </View>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Tìm thành viên trong danh bạ" />
      </View>

      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(uid => (
            <PressableScale key={uid} style={styles.chip} onPress={() => toggle(uid)}>
              <Text style={styles.chipText} numberOfLines={1}>
                {users[uid]?.name ?? 'Thành viên'}
              </Text>
              <Icon name="close" size={14} color={colors.primary} />
            </PressableScale>
          ))}
        </View>
      )}

      <FlatList
        data={contacts}
        keyExtractor={u => u.uid}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const checked = selected.includes(item.uid);
          return (
            <PressableScale
              style={styles.row}
              onPress={() => toggle(item.uid)}
              scaleTo={0.98}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={item.name}>
              <Avatar uid={item.uid} name={item.name} size={48} online={item.online} ringColor={colors.background} />
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked && <Icon name="check" size={18} color="#fff" />}
              </View>
            </PressableScale>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Không tìm thấy liên hệ</Text>}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.hint}>
          {missing > 0
            ? `Chọn thêm ${missing} người nữa (tối thiểu ${MIN_OTHER_MEMBERS} người ngoài bạn)`
            : `Đã chọn ${selected.length} thành viên`}
        </Text>
        <PrimaryButton
          title={`Tạo nhóm${selected.length ? ` (${selected.length + 1} người)` : ''}`}
          onPress={onCreate}
          loading={saving}
          disabled={!!error}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  bar: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    gap: spacing.md,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: -spacing.sm },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: font.heading, fontWeight: '800', color: colors.onPrimary },
  nameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
  nameInput: { flex: 1, fontSize: font.title, color: colors.text, fontWeight: '600' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 160,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  chipText: { color: colors.primary, fontWeight: '700', fontSize: font.small + 1, flexShrink: 1 },
  list: { paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  name: { flex: 1, fontSize: font.title - 1, fontWeight: '700', color: colors.text },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.offline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: font.small + 1 },
});
