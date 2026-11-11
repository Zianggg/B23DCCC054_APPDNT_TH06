import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Avatar from '../components/Avatar';
import PressableScale from '../components/PressableScale';
import PrimaryButton from '../components/PrimaryButton';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import { Conversation, subscribeConversation } from '../services/chatService';
import {
  addMembers,
  isGroupAdmin,
  leaveGroup,
  MAX_GROUP_NAME,
  removeMember,
  renameGroup,
} from '../services/groupService';
import { filterContacts } from '../services/userService';
import { formatLastSeen } from '../utils/formatTime';
import { AppStackParamList } from '../navigation/types';
import { colors, font, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'GroupInfo'>;

const errorText = (e: any, fallback: string) =>
  e?.message === 'OFFLINE'
    ? 'Không có kết nối mạng'
    : e?.message === 'NOT_ADMIN'
    ? 'Chỉ trưởng nhóm làm được'
    : e?.message || fallback;

export default function GroupInfoScreen({ navigation, route }: Props) {
  const { convId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUid = user?.uid ?? '';
  const { users, userList } = useChats();
  const myName = users[myUid]?.name || user?.displayName || 'Một người';

  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  useEffect(() => subscribeConversation(convId, setConv), [convId]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const admin = !!conv && isGroupAdmin(conv, myUid);
  const memberUids = useMemo(() => {
    if (!conv) {
      return [];
    }
    // Trưởng nhóm lên đầu, sau đó theo tên
    return Object.keys(conv.members).sort((a, b) =>
      a === conv.createdBy
        ? -1
        : b === conv.createdBy
        ? 1
        : (users[a]?.name ?? '').localeCompare(users[b]?.name ?? '', 'vi'),
    );
  }, [conv, users]);
  const candidates = useMemo(
    () =>
      filterContacts(userList, myUid, '').filter(u => !conv?.members[u.uid]),
    [userList, myUid, conv],
  );

  if (conv === undefined) {
    return (
      <View style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (conv === null || conv.type !== 'group') {
    return (
      <View style={[styles.safe, styles.center]}>
        <Text style={styles.muted}>
          Bạn không còn là thành viên của nhóm này.
        </Text>
      </View>
    );
  }

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      Alert.alert('Lỗi', errorText(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (name.trim() === conv.name) {
      setEditing(false);
      return;
    }
    if (
      await run(
        () => renameGroup(conv, myUid, myName, name),
        'Không đổi được tên nhóm',
      )
    ) {
      setEditing(false);
    }
  };

  const confirmRemove = (uid: string) => {
    const who = users[uid]?.name ?? 'thành viên';
    Alert.alert(
      'Xóa khỏi nhóm?',
      `${who} sẽ không còn xem và gửi tin trong nhóm.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () =>
            run(
              () => removeMember(conv, myUid, myName, uid, who),
              'Không xóa được thành viên',
            ),
        },
      ],
    );
  };

  const confirmLeave = () =>
    Alert.alert(
      'Rời nhóm?',
      admin
        ? 'Bạn là trưởng nhóm. Quyền trưởng nhóm sẽ được chuyển cho thành viên khác.'
        : 'Bạn sẽ không nhận tin nhắn của nhóm này nữa.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rời nhóm',
          style: 'destructive',
          onPress: async () => {
            if (
              await run(
                () => leaveGroup(conv, myUid, myName),
                'Không rời được nhóm',
              )
            ) {
              navigation.popToTop();
            }
          },
        },
      ],
    );

  const saveAdd = async () => {
    const names = Object.fromEntries(
      picked.map(uid => [uid, users[uid]?.name ?? 'thành viên']),
    );
    if (
      await run(
        () => addMembers(conv, myUid, myName, picked, names),
        'Không thêm được thành viên',
      )
    ) {
      setAdding(false);
      setPicked([]);
    }
  };

  return (
    <View style={styles.safe}>
      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={styles.back}
          accessibilityLabel="Quay lại"
        >
          <Icon name="arrow-left" size={24} color={colors.onPrimary} />
        </PressableScale>
        <Text style={styles.barTitle}>Thông tin nhóm</Text>
      </View>

      <FlatList
        data={memberUids}
        keyboardShouldPersistTaps="handled"
        keyExtractor={uid => uid}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Avatar uid={conv.id} name={conv.name ?? 'Nhóm'} size={84} />
              {editing ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.nameInput}
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_GROUP_NAME}
                    autoFocus
                    accessibilityLabel="Tên nhóm mới"
                  />
                  <PressableScale
                    onPress={saveName}
                    disabled={busy}
                    accessibilityLabel="Lưu tên nhóm"
                  >
                    <Icon name="check" size={26} color={colors.primary} />
                  </PressableScale>
                  <PressableScale
                    onPress={() => setEditing(false)}
                    accessibilityLabel="Hủy đổi tên"
                  >
                    <Icon name="close" size={26} color={colors.textMuted} />
                  </PressableScale>
                </View>
              ) : (
                <View style={styles.editRow}>
                  <Text style={styles.groupName}>{conv.name}</Text>
                  {admin && (
                    <PressableScale
                      onPress={() => {
                        setName(conv.name ?? '');
                        setEditing(true);
                      }}
                      accessibilityLabel="Đổi tên nhóm"
                    >
                      <Icon name="pencil" size={22} color={colors.primary} />
                    </PressableScale>
                  )}
                </View>
              )}
              <Text style={styles.muted}>{memberUids.length} thành viên</Text>
            </View>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Thành viên</Text>
              {admin && (
                <PressableScale
                  style={styles.addBtn}
                  onPress={() => setAdding(true)}
                  accessibilityLabel="Thêm thành viên"
                >
                  <Icon name="account-plus" size={18} color={colors.primary} />
                  <Text style={styles.addText}>Thêm</Text>
                </PressableScale>
              )}
            </View>
          </View>
        }
        renderItem={({ item: uid }) => {
          const u = users[uid];
          const isMe = uid === myUid;
          return (
            <View style={styles.member}>
              <Avatar
                uid={uid}
                name={u?.name ?? ''}
                size={46}
                online={!!u?.online}
                ringColor={colors.background}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {u?.name ?? 'Thành viên'}
                  {isMe ? ' (Bạn)' : ''}
                </Text>
                <Text style={styles.memberSub} numberOfLines={1}>
                  {uid === conv.createdBy
                    ? 'Trưởng nhóm'
                    : u?.online
                    ? 'Đang hoạt động'
                    : formatLastSeen(u?.lastSeen) || 'Ngoại tuyến'}
                </Text>
              </View>
              {admin && !isMe && (
                <PressableScale
                  onPress={() => confirmRemove(uid)}
                  hitSlop={8}
                  accessibilityLabel={`Xóa ${u?.name ?? ''} khỏi nhóm`}
                >
                  <Icon name="account-remove" size={24} color={colors.danger} />
                </PressableScale>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.leave}>
            <PrimaryButton
              title="Rời nhóm"
              variant="danger"
              onPress={confirmLeave}
              loading={busy}
            />
          </View>
        }
      />

      <Modal
        visible={adding}
        animationType="slide"
        transparent
        onRequestClose={() => setAdding(false)}
      >
        <View style={styles.backdrop}>
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <Text style={styles.sheetTitle}>Thêm thành viên</Text>
            <FlatList
              data={candidates}
              keyboardShouldPersistTaps="handled"
              keyExtractor={u => u.uid}
              style={styles.sheetList}
              ListEmptyComponent={
                <Text style={styles.muted}>
                  Mọi liên hệ đều đã ở trong nhóm
                </Text>
              }
              renderItem={({ item }) => {
                const on = picked.includes(item.uid);
                return (
                  <PressableScale
                    style={styles.member}
                    onPress={() =>
                      setPicked(p =>
                        on ? p.filter(x => x !== item.uid) : [...p, item.uid],
                      )
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Avatar uid={item.uid} name={item.name} size={42} />
                    <Text style={[styles.memberName, styles.flex]}>
                      {item.name}
                    </Text>
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && <Icon name="check" size={18} color="#fff" />}
                    </View>
                  </PressableScale>
                );
              }}
            />
            <PrimaryButton
              title={
                picked.length
                  ? `Thêm ${picked.length} người`
                  : 'Chọn người để thêm'
              }
              onPress={saveAdd}
              disabled={picked.length === 0}
              loading={busy}
            />
            <PressableScale
              style={styles.cancel}
              onPress={() => setAdding(false)}
            >
              <Text style={styles.muted}>Hủy</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
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
  barTitle: {
    fontSize: font.title + 3,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  groupName: {
    fontSize: font.heading,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  nameInput: {
    flex: 1,
    fontSize: font.title + 2,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  muted: { color: colors.textMuted, fontSize: font.body, textAlign: 'center' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  section: {
    fontSize: font.small,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  addText: { color: colors.primary, fontWeight: '800' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: font.title - 1,
    fontWeight: '700',
    color: colors.text,
  },
  memberSub: {
    fontSize: font.small + 1,
    color: colors.textMuted,
    marginTop: 2,
  },
  leave: { padding: spacing.lg, marginTop: spacing.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '80%',
  },
  sheetTitle: {
    fontSize: font.title + 2,
    fontWeight: '800',
    color: colors.text,
  },
  sheetList: { flexGrow: 0 },
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
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
});
