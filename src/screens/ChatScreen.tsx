import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ChatHeader from '../components/ChatHeader';
import ChatInput from '../components/ChatInput';
import MessageBubble from '../components/MessageBubble';
import MessageActions from '../components/MessageActions';
import ReplyBar from '../components/ReplyBar';
import SearchPanel from '../components/SearchPanel';
import ImageViewer from '../components/ImageViewer';
import { PendingImage } from '../components/ImageBubbles';
import {
  PickedImage,
  pickImage,
  uploadImage,
  UploadTask,
} from '../services/uploadService';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import {
  Conversation,
  Extra,
  makeReplyRef,
  markAsRead,
  Message,
  MessageBody,
  previewOf,
  Reaction,
  RECALLED_TEXT,
  recallMessage,
  ReplyRef,
  SendTarget,
  sendImage,
  toggleReaction,
  sendLocation,
  sendText,
  subscribeConversation,
} from '../services/chatService';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../services/locationService';
import {
  buildNotificationUpdates,
  messageNotificationText,
  reactionNotificationText,
  recipientsToNotify,
} from '../services/notificationService';
import {
  seenInfo,
  setActiveConv,
  subscribeActiveConvs,
  subscribeReadStatus,
  subscribeTyping,
} from '../services/presenceService';
import { useMessages } from '../hooks/useMessages';
import { useNow, useTyping } from '../hooks/useTyping';
import { chatDisplay } from '../utils/chatDisplay';
import { formatLastSeen, formatMessageTime } from '../utils/formatTime';
import { AppStackParamList } from '../navigation/types';
import { colors, font, spacing } from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Chat'>;

// Ảnh đang chờ tải lên (chỉ có ở máy mình, chưa ghi vào database)
type PendingUpload = {
  id: string;
  image: PickedImage;
  status: 'uploading' | 'error';
  progress: number;
  url?: string; // đã tải lên xong nhưng ghi tin lỗi thì thử lại không cần tải lại
};

type Row =
  | { kind: 'pending'; item: PendingUpload }
  | { kind: 'msg'; item: Message };

export default function ChatScreen({ navigation, route }: Props) {
  const { convId, otherUid: paramOtherUid } = route.params;
  const myUid = useAuth().user?.uid ?? '';
  const { users, chats } = useChats();
  const insets = useSafeAreaInsets();

  // undefined: đang tải; null: chưa tồn tại (chat 1-1 chưa có tin nào)
  const [conv, setConv] = useState<Conversation | null | undefined>(undefined);
  useEffect(() => {
    setConv(undefined);
    return subscribeConversation(convId, setConv);
  }, [convId]);

  // Bị xóa khỏi nhóm (hoặc nhóm không còn) trong lúc đang mở: báo và quay lại
  const wasGroup = useRef(false);
  useEffect(() => {
    if (conv?.type === 'group') {
      wasGroup.current = true;
    } else if (conv === null && wasGroup.current) {
      wasGroup.current = false;
      Alert.alert('Thông báo', 'Bạn không còn là thành viên của nhóm này.');
      navigation.popToTop();
    }
  }, [conv, navigation]);

  const exists = !!conv;
  const target: SendTarget | undefined = useMemo(() => {
    if (conv) {
      return { ...conv, exists: true };
    }
    if (conv === null && paramOtherUid) {
      return {
        id: convId,
        type: 'direct',
        members: { [myUid]: true, [paramOtherUid]: true },
        exists: false,
      };
    }
    return undefined;
  }, [conv, convId, myUid, paramOtherUid]);

  const display = chatDisplay(target, myUid, users, paramOtherUid);

  // ---------- Thông báo: chỉ ghi cho người KHÔNG đang mở cuộc trò chuyện này ----------
  const memberKey = target ? Object.keys(target.members).sort().join(',') : '';
  const [activeConvs, setActiveConvs] = useState<Record<string, string | null>>(
    {},
  );
  useEffect(() => {
    const others = memberKey.split(',').filter(uid => uid && uid !== myUid);
    if (others.length === 0) {
      return;
    }
    return subscribeActiveConvs(others, setActiveConvs);
  }, [memberKey, myUid]);

  const myName = users[myUid]?.name;
  const notifyMessage: Extra = (body: MessageBody) =>
    target
      ? buildNotificationUpdates(
          recipientsToNotify(
            Object.keys(target.members),
            myUid,
            convId,
            activeConvs,
          ),
          {
            type: 'message',
            convId,
            fromUid: myUid,
            text: messageNotificationText(
              myName,
              previewOf(body),
              display.isGroup ? display.title : undefined,
            ),
          },
        )
      : {};
  const { messages, ready, loadingOlder, loadOlder, loadThrough } = useMessages(
    convId,
    exists,
  );

  // Khi bàn phím mở thì không cần chừa chỗ cho thanh điều hướng hệ thống
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardShown(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Chỉ tin đến sau lúc mở màn mới có hiệu ứng bay vào
  const openedAt = useRef(Date.now() - 1500);

  // App đang ở nền thì không tính là "đang xem" cuộc trò chuyện
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', s =>
      setAppActive(s === 'active'),
    );
    return () => sub.remove();
  }, []);

  // Đánh dấu mình đang ở trong cuộc trò chuyện này (dùng cho thông báo)
  useEffect(() => {
    if (!appActive || !myUid) {
      return;
    }
    setActiveConv(myUid, convId).catch(() => {});
    return () => {
      setActiveConv(myUid, null).catch(() => {});
    };
  }, [appActive, myUid, convId]);

  // Ai đang soạn tin và thời điểm đọc cuối của từng thành viên
  const [typingUids, setTypingUids] = useState<string[]>([]);
  const [readStatus, setReadStatus] = useState<Record<string, number>>({});
  useEffect(() => {
    setTypingUids([]);
    setReadStatus({});
    if (!exists) {
      return;
    }
    const offTyping = subscribeTyping(convId, myUid, setTypingUids);
    const offRead = subscribeReadStatus(convId, setReadStatus);
    return () => {
      offTyping();
      offRead();
    };
  }, [convId, myUid, exists]);

  const typing = useTyping(convId, myUid, exists);
  const stopTyping = typing.stop;
  // Ra nền thì tắt luôn "đang soạn tin…"
  useEffect(() => {
    if (!appActive) {
      stopTyping();
    }
  }, [appActive, stopTyping]);

  // Đang mở cuộc trò chuyện: số chưa đọc về 0 và cập nhật "đã xem" khi có tin mới của người khác
  const myUnread = chats.find(c => c.convId === convId)?.unread ?? 0;
  const newestOther = messages.find(
    m => m.senderId !== myUid && m.type !== 'system',
  );
  const needRead =
    myUnread > 0 ||
    (!!newestOther?.createdAt &&
      (readStatus[myUid] ?? 0) < newestOther.createdAt);
  // Chỉ đánh dấu khi còn là thành viên (vừa rời / bị xóa khỏi nhóm thì không ghi nữa)
  const amMember = !!conv?.members?.[myUid];
  useEffect(() => {
    if (amMember && appActive && needRead) {
      markAsRead(myUid, convId).catch(() => {});
    }
  }, [amMember, appActive, needRead, myUid, convId]);

  const now = useNow();
  const status = useMemo(() => {
    if (typingUids.length > 0) {
      if (!display.isGroup) {
        return 'đang soạn tin…';
      }
      const names = typingUids.map(
        uid => users[uid]?.name?.split(' ').slice(-1)[0] ?? 'Ai đó',
      );
      return `${names.slice(0, 2).join(', ')}${
        names.length > 2 ? '…' : ''
      } đang soạn tin…`;
    }
    if (display.isGroup && conv) {
      const ids = Object.keys(conv.members);
      const online = ids.filter(
        uid => uid !== myUid && users[uid]?.online,
      ).length;
      return `${ids.length} thành viên · ${online} đang online`;
    }
    const other = display.otherUid ? users[display.otherUid] : undefined;
    if (other?.online) {
      return 'Đang hoạt động';
    }
    return formatLastSeen(other?.lastSeen, now) || 'Ngoại tuyến';
  }, [typingUids, display.isGroup, display.otherUid, conv, myUid, users, now]);

  // "Đã gửi" / "Đã xem" dưới tin mới nhất của mình
  const myLastId = messages.find(
    m => m.senderId === myUid && m.type !== 'system',
  )?.id;
  const receipt = useMemo(() => {
    const msg = messages.find(m => m.id === myLastId);
    if (!msg || !target) {
      return undefined;
    }
    const others = Object.keys(target.members).filter(uid => uid !== myUid);
    const info = seenInfo(msg.createdAt, readStatus, others);
    if (!info.seen) {
      return 'Đã gửi';
    }
    if (display.isGroup) {
      return info.seenCount >= others.length
        ? 'Tất cả đã xem'
        : `Đã xem bởi ${info.seenCount} người`;
    }
    return `Đã xem lúc ${formatMessageTime(info.seenAt)}`;
  }, [messages, myLastId, target, myUid, readStatus, display.isGroup]);

  const reportSendError = (e: any) =>
    Alert.alert(
      'Lỗi',
      e?.message === 'OFFLINE'
        ? 'Không có kết nối mạng, tin nhắn chưa được gửi'
        : 'Không gửi được tin nhắn',
    );

  const onSend = async (text: string) => {
    if (!target) {
      return;
    }
    try {
      await sendText(myUid, target, text, notifyMessage, replyTo ?? undefined);
      setReplyTo(null);
    } catch (e) {
      reportSendError(e);
      throw e;
    }
  };

  const onSendLocation = async () => {
    if (!target) {
      return;
    }
    const granted = await requestLocationPermission();
    if (!granted) {
      Alert.alert(
        'Không có quyền vị trí',
        'Bạn đã từ chối quyền truy cập vị trí. Hãy bật lại trong Cài đặt để gửi vị trí.',
      );
      return;
    }
    let pos;
    try {
      pos = await getCurrentPosition();
    } catch {
      Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại');
      return;
    }
    try {
      await sendLocation(myUid, target, pos.lat, pos.lng, notifyMessage);
    } catch (e) {
      reportSendError(e);
    }
  };

  // Nhóm: hiện tên người gửi ở tin đầu tiên của mỗi chuỗi tin liên tiếp.
  // Danh sách sắp mới -> cũ nên tin liền trước theo thời gian là phần tử index + 1.
  const senderNameAt = (item: Message, index: number) => {
    if (!display.isGroup || item.senderId === myUid || item.type === 'system') {
      return undefined;
    }
    const prev = messages[index + 1];
    if (prev && prev.senderId === item.senderId && prev.type !== 'system') {
      return undefined;
    }
    return users[item.senderId]?.name ?? 'Thành viên';
  };

  // ---------- Gửi ảnh ----------
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const tasks = useRef(new Map<string, UploadTask>());
  useEffect(() => {
    const running = tasks.current;
    return () => running.forEach(t => t.cancel()); // rời màn thì hủy các lượt tải dở
  }, []);

  const patchPending = (id: string, p: Partial<PendingUpload>) =>
    setPending(prev => prev.map(x => (x.id === id ? { ...x, ...p } : x)));

  const startUpload = async (item: PendingUpload) => {
    if (!target) {
      return;
    }
    patchPending(item.id, { status: 'uploading', progress: 0 });
    try {
      let url = item.url;
      if (!url) {
        const task = uploadImage(item.image, ratio =>
          patchPending(item.id, { progress: ratio }),
        );
        tasks.current.set(item.id, task);
        url = await task.promise;
        tasks.current.delete(item.id);
        patchPending(item.id, { url });
      }
      await sendImage(myUid, target, url, item.image, notifyMessage);
      setPending(prev => prev.filter(x => x.id !== item.id));
    } catch (e: any) {
      tasks.current.delete(item.id);
      if (e?.message === 'CANCELLED') {
        return;
      }
      patchPending(item.id, { status: 'error' });
      if (e?.message === 'CLOUDINARY_NOT_CONFIGURED') {
        Alert.alert(
          'Chưa cấu hình Cloudinary',
          'Điền cloud name và upload preset trong src/services/cloudinaryConfig.ts.',
        );
      }
    }
  };

  const cancelUpload = (id: string) => {
    tasks.current.get(id)?.cancel();
    tasks.current.delete(id);
    setPending(prev => prev.filter(x => x.id !== id));
  };

  const pickFrom = async (source: 'camera' | 'library') => {
    try {
      const image = await pickImage(source);
      if (!image) {
        return;
      }
      const item: PendingUpload = {
        id: `pending-${Date.now()}`,
        image,
        status: 'uploading',
        progress: 0,
      };
      setPending(prev => [item, ...prev]);
      startUpload(item);
    } catch (e: any) {
      if (e?.message === 'CAMERA_DENIED') {
        Alert.alert(
          'Không có quyền camera',
          'Bạn đã từ chối quyền sử dụng camera. Hãy bật lại trong Cài đặt để chụp ảnh.',
        );
      } else if (e?.message === 'camera_unavailable') {
        Alert.alert('Lỗi', 'Thiết bị không có camera');
      } else {
        Alert.alert('Lỗi', 'Không mở được ảnh');
      }
    }
  };

  const onPickImage = () =>
    Alert.alert('Gửi ảnh', 'Chọn nguồn ảnh', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Thư viện', onPress: () => pickFrom('library') },
      { text: 'Chụp ảnh', onPress: () => pickFrom('camera') },
    ]);

  const rows: Row[] = useMemo(
    () => [
      ...pending.map(item => ({ kind: 'pending' as const, item })),
      ...messages.map(item => ({ kind: 'msg' as const, item })),
    ],
    [pending, messages],
  );

  // ---------- Trả lời, tìm kiếm và nhảy tới một tin ----------
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pendingJump = useRef<string | null>(null);

  const nameOf = (uid: string) =>
    uid === myUid ? 'Bạn' : users[uid]?.name ?? 'Thành viên';

  const scrollToRow = (index: number) =>
    listRef.current?.scrollToIndex({
      index,
      viewPosition: 0.5,
      animated: true,
    });

  const jumpTo = async (id: string) => {
    setHighlightId(id);
    const index = rows.findIndex(r => r.item.id === id);
    if (index >= 0) {
      scrollToRow(index);
      return;
    }
    pendingJump.current = id;
    const found = await loadThrough(id);
    if (!found) {
      pendingJump.current = null;
      Alert.alert('Không tìm thấy', 'Không tìm thấy tin nhắn gốc.');
    }
  };

  // Tin cũ vừa được tải thêm: cuộn tới khi nó đã có trong danh sách
  useEffect(() => {
    const id = pendingJump.current;
    if (!id) {
      return;
    }
    const index = rows.findIndex(r => r.item.id === id);
    if (index >= 0) {
      pendingJump.current = null;
      requestAnimationFrame(() => scrollToRow(index));
    }
  }, [rows]);

  // Bỏ tô sáng sau 2 giây
  useEffect(() => {
    if (!highlightId) {
      return;
    }
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const onReply = () => {
    const msg = menuMsg;
    closeMenu();
    if (msg) {
      setReplyTo(makeReplyRef(msg));
    }
  };

  // ---------- Menu nhấn giữ ----------
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const closeMenu = () => setMenuMsg(null);
  const lastMsgId = chats.find(c => c.convId === convId)?.lastMsgId;

  const onReact = (emoji: Reaction) => {
    const msg = menuMsg;
    closeMenu();
    if (!msg) {
      return;
    }
    toggleReaction(convId, msg, myUid, emoji, () =>
      buildNotificationUpdates([msg.senderId], {
        type: 'reaction',
        convId,
        fromUid: myUid,
        text: reactionNotificationText(
          myName,
          emoji,
          msg.recalled ? 'Tin nhắn' : previewOf(msg),
        ),
      }),
    ).catch(() => Alert.alert('Lỗi', 'Không thả được cảm xúc'));
  };

  const onCopy = () => {
    const msg = menuMsg;
    closeMenu();
    if (!msg) {
      return;
    }
    const value =
      msg.type === 'location'
        ? `${msg.lat}, ${msg.lng}`
        : msg.type === 'image'
        ? msg.imageUrl
        : msg.text;
    if (value) {
      Clipboard.setString(value);
      ToastAndroid.show('Đã sao chép', ToastAndroid.SHORT);
    }
  };

  const onRecall = () => {
    const msg = menuMsg;
    closeMenu();
    if (!msg || !target) {
      return;
    }
    Alert.alert(
      'Thu hồi tin nhắn?',
      'Tin nhắn sẽ được thu hồi với mọi người trong cuộc trò chuyện.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: () =>
            recallMessage(myUid, target, msg, msg.id === lastMsgId).catch(e =>
              Alert.alert(
                'Lỗi',
                e?.message === 'OFFLINE'
                  ? 'Không có kết nối mạng'
                  : 'Không thu hồi được tin nhắn',
              ),
            ),
        },
      ],
    );
  };

  const inputPadding = { paddingBottom: keyboardShown ? 0 : insets.bottom };

  return (
    <View style={styles.safe}>
      <ChatHeader
        avatarUid={display.avatarUid}
        title={display.title}
        status={status}
        highlight={typingUids.length > 0}
        online={display.isGroup ? undefined : display.online}
        onBack={() => navigation.goBack()}
        onSearch={exists ? () => setSearchOpen(true) : undefined}
        onPressTitle={
          display.isGroup && exists
            ? () => navigation.navigate('GroupInfo', { convId })
            : undefined
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {!ready ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          // Để ngoài FlatList inverted, vì danh sách lật sẽ lật luôn cả phần chữ
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Hãy gửi lời chào đầu tiên 👋</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            inverted
            onScrollToIndexFailed={info => {
              // Chiều cao các tin khác nhau: cuộn gần đúng trước rồi thử lại
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
              setTimeout(() => scrollToRow(info.index), 150);
            }}
            data={rows}
            keyExtractor={r => r.item.id}
            renderItem={({ item: row, index: rowIndex }) => {
              if (row.kind === 'pending') {
                const p = row.item;
                return (
                  <PendingImage
                    uri={p.image.uri}
                    width={p.image.width}
                    height={p.image.height}
                    status={p.status}
                    progress={p.progress}
                    onRetry={() => startUpload(p)}
                    onCancel={() => cancelUpload(p.id)}
                  />
                );
              }
              const item = row.item;
              const index = rowIndex - pending.length;
              return (
                <MessageBubble
                  message={item}
                  mine={item.senderId === myUid}
                  onOpenImage={setViewUrl}
                  senderName={senderNameAt(item, index)}
                  myUid={myUid}
                  highlighted={item.id === highlightId}
                  replyName={
                    item.replyTo ? nameOf(item.replyTo.senderId) : undefined
                  }
                  replyPreview={
                    item.replyTo &&
                    messages.find(m => m.id === item.replyTo?.id)?.recalled
                      ? RECALLED_TEXT
                      : undefined
                  }
                  onPressReply={
                    item.replyTo ? () => jumpTo(item.replyTo!.id) : undefined
                  }
                  onLongPress={
                    item.recalled ? undefined : () => setMenuMsg(item)
                  }
                  footer={
                    item.id === myLastId && receipt ? (
                      <Text style={styles.receipt}>{receipt}</Text>
                    ) : undefined
                  }
                  animateIn={(item.createdAt ?? Date.now()) > openedAt.current}
                />
              );
            }}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingOlder ? (
                <ActivityIndicator
                  style={styles.older}
                  color={colors.primary}
                />
              ) : undefined
            }
          />
        )}
        {replyTo && (
          <ReplyBar
            name={nameOf(replyTo.senderId)}
            preview={replyTo.preview}
            onCancel={() => setReplyTo(null)}
          />
        )}
        <View style={[styles.inputWrap, inputPadding]}>
          <ChatInput
            onSend={onSend}
            onSendLocation={onSendLocation}
            onTextChange={typing.onTextChange}
            onPickImage={onPickImage}
          />
        </View>
      </KeyboardAvoidingView>
      <ImageViewer url={viewUrl} onClose={() => setViewUrl(null)} />
      <MessageActions
        message={menuMsg}
        mine={menuMsg?.senderId === myUid}
        myReaction={menuMsg?.reactions?.[myUid]}
        onClose={closeMenu}
        onReact={onReact}
        onCopy={onCopy}
        onRecall={onRecall}
        onReply={onReply}
      />
      {searchOpen && (
        <View style={[styles.searchLayer, { top: insets.top + 76 }]}>
          <SearchPanel
            convId={convId}
            myUid={myUid}
            users={users}
            onClose={() => setSearchOpen(false)}
            onSelect={msg => {
              setSearchOpen(false);
              jumpTo(msg.id);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  inputWrap: { backgroundColor: colors.surface },
  list: { paddingVertical: spacing.md, flexGrow: 1 },
  older: { marginVertical: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: font.body },
  searchLayer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  receipt: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    marginRight: spacing.xs,
  },
});
