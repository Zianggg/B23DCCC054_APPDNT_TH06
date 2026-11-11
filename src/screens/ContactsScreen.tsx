import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenHeader from '../components/ScreenHeader';
import SearchBar from '../components/SearchBar';
import UserItem from '../components/UserItem';
import EmptyState from '../components/EmptyState';
import Avatar from '../components/Avatar';
import PressableScale from '../components/PressableScale';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import { AppUser, filterContacts } from '../services/userService';
import { directConvId } from '../services/chatService';
import { AppStackParamList } from '../navigation/types';
import { colors, font, spacing } from '../theme';

export default function ContactsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { user } = useAuth();
  const { userList } = useChats();
  const [query, setQuery] = useState('');

  const contacts = useMemo(
    () => filterContacts(userList, user?.uid ?? '', query),
    [userList, user?.uid, query],
  );
  const online = useMemo(
    () => filterContacts(userList, user?.uid ?? '', '').filter(u => u.online),
    [userList, user?.uid],
  );
  const openChat = (u: AppUser) =>
    navigation.navigate('Chat', { convId: directConvId(user?.uid ?? '', u.uid), otherUid: u.uid });

  const onlineStrip =
    !query && online.length > 0 ? (
      <View style={styles.stripWrap}>
        <Text style={styles.section}>Đang hoạt động</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {online.map(u => (
            <PressableScale key={u.uid} style={styles.chip} onPress={() => openChat(u)}>
              <Avatar uid={u.uid} name={u.name} size={58} online ringColor={colors.background} />
              <Text style={styles.chipName} numberOfLines={1}>
                {u.name.split(' ').slice(-1)[0]}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
        <Text style={styles.section}>Tất cả</Text>
      </View>
    ) : undefined;

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="Danh bạ"
        subtitle={`${online.length} người đang hoạt động · ${contacts.length} liên hệ`}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Tìm theo tên hoặc email" />
      </ScreenHeader>
      <FlatList
        data={contacts}
        keyExtractor={u => u.uid}
        ListHeaderComponent={onlineStrip}
        renderItem={({ item }) => <UserItem user={item} onPress={() => openChat(item)} />}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={<EmptyState icon="account-search-outline" title="Không tìm thấy người dùng" />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  stripWrap: { paddingTop: spacing.md },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    fontSize: font.small,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.lg },
  chip: { width: 64, alignItems: 'center' },
  chipName: { marginTop: spacing.xs, fontSize: font.small, fontWeight: '600', color: colors.text },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 80 },
});
