import {
  DataSnapshot,
  endAt,
  endBefore,
  get,
  increment,
  limitToLast,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  startAt,
  update,
} from 'firebase/database';
import { db } from './firebase';
import { isConnected } from './userService';
import { getChatId } from '../utils/chatId';

export type ConvType = 'direct' | 'group';

export type Conversation = {
  id: string;
  type: ConvType;
  name?: string;
  members: Record<string, true>;
  createdBy: string;
  createdAt?: number;
};

export type MessageType = 'text' | 'image' | 'location' | 'system';

export type Message = {
  id: string;
  senderId: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  width?: number; // kích thước ảnh, để giữ đúng tỉ lệ khi hiển thị
  height?: number;
  lat?: number;
  lng?: number;
  createdAt?: number;
  recalled?: boolean;
  reactions?: Record<string, string>;
  replyTo?: ReplyRef; // trả lời một tin cụ thể
};

// Trích dẫn tin gốc: lưu kèm bản xem trước để hiển thị ngay, kể cả khi tin gốc chưa được tải
export type ReplyRef = { id: string; senderId: string; preview: string };

export type MessageBody = Pick<
  Message,
  'type' | 'text' | 'imageUrl' | 'width' | 'height' | 'lat' | 'lng' | 'replyTo'
>;

export type UserChat = {
  convId: string;
  lastMessage: string;
  lastSenderId?: string;
  lastMsgId?: string;
  updatedAt: number;
  unread: number;
};

export const PAGE_SIZE = 20;
export const LOCATION_PREVIEW = '📍 Vị trí';
export const IMAGE_PREVIEW = '📷 Hình ảnh';
export const RECALLED_TEXT = 'Tin nhắn đã được thu hồi';

export const directConvId = getChatId;

export const memberIds = (conv: Pick<Conversation, 'members'>) => Object.keys(conv.members ?? {});

// Người còn lại trong cuộc trò chuyện 1-1
export function otherMember(conv: Pick<Conversation, 'members'>, myUid: string): string | undefined {
  return memberIds(conv).find(uid => uid !== myUid);
}

export const REPLY_PREVIEW_MAX = 80;

export function makeReplyRef(msg: Message): ReplyRef {
  const preview = msg.recalled ? RECALLED_TEXT : previewOf(msg);
  return {
    id: msg.id,
    senderId: msg.senderId,
    preview: preview.length > REPLY_PREVIEW_MAX ? `${preview.slice(0, REPLY_PREVIEW_MAX)}…` : preview,
  };
}

// Dòng xem trước ở màn Home
export function previewOf(body: MessageBody): string {
  switch (body.type) {
    case 'image':
      return IMAGE_PREVIEW;
    case 'location':
      return LOCATION_PREVIEW;
    default:
      return body.text ?? '';
  }
}

// Gói tin nhắn + lastMessage + số chưa đọc của mọi thành viên vào MỘT lần update nhiều đường dẫn.
// Số chưa đọc tăng bằng increment(1) ở phía server, không đọc giá trị cũ.
export function buildSendUpdates(
  convId: string,
  members: string[],
  myUid: string,
  key: string,
  body: MessageBody,
): Record<string, unknown> {
  const time = serverTimestamp();
  const updates: Record<string, unknown> = {
    [`messages/${convId}/${key}`]: { senderId: myUid, ...body, createdAt: time },
    [`readStatus/${convId}/${myUid}`]: time,
  };
  const preview = previewOf(body);
  for (const uid of members) {
    const base = `userChats/${uid}/${convId}`;
    updates[`${base}/lastMessage`] = preview;
    // Tin hệ thống không có tiền tố "Bạn: " / "Tên: " ở Home
    updates[`${base}/lastSenderId`] = body.type === 'system' ? null : myUid;
    updates[`${base}/lastMsgId`] = key;
    updates[`${base}/updatedAt`] = time;
    if (uid !== myUid) {
      updates[`${base}/unread`] = increment(1);
    }
  }
  return updates;
}

// Tạo cuộc trò chuyện 1-1 khi gửi tin đầu tiên. Dùng transaction để hai người
// cùng nhắn lần đầu thì vẫn chỉ có một bản ghi.
export async function ensureDirectConversation(myUid: string, otherUid: string): Promise<string> {
  const convId = directConvId(myUid, otherUid);
  await runTransaction(ref(db, `conversations/${convId}`), current =>
    current
      ? undefined
      : {
          type: 'direct',
          members: { [myUid]: true, [otherUid]: true },
          createdBy: myUid,
          createdAt: serverTimestamp(),
        },
  );
  return convId;
}

// conv.exists === false nghĩa là cuộc trò chuyện 1-1 chưa được tạo trên server
export type SendTarget = Pick<Conversation, 'id' | 'type' | 'members'> & { exists: boolean };

export async function sendMessage(
  myUid: string,
  conv: SendTarget,
  body: MessageBody,
  extra: Record<string, unknown> = {},
): Promise<string> {
  // Khi mất mạng update() không báo lỗi mà treo tới lúc có mạng lại, nên chặn trước
  if (!isConnected()) {
    throw new Error('OFFLINE');
  }
  if (!conv.exists && conv.type === 'direct') {
    const other = otherMember(conv, myUid);
    if (!other) {
      throw new Error('NO_MEMBER');
    }
    await ensureDirectConversation(myUid, other);
  }
  const key = push(ref(db, `messages/${conv.id}`)).key as string;
  await update(ref(db), {
    ...buildSendUpdates(conv.id, memberIds(conv), myUid, key, body),
    ...extra,
  });
  return key;
}

// extra: các đường dẫn ghi kèm (thông báo) trong cùng lệnh update
export type Extra = (body: MessageBody) => Record<string, unknown>;

export async function sendText(
  myUid: string,
  conv: SendTarget,
  text: string,
  extra?: Extra,
  replyTo?: ReplyRef,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('EMPTY');
  }
  const body: MessageBody = { type: 'text', text: trimmed };
  if (replyTo) {
    body.replyTo = replyTo;
  }
  return sendMessage(myUid, conv, body, extra?.(body));
}

export async function sendLocation(
  myUid: string,
  conv: SendTarget,
  lat: number,
  lng: number,
  extra?: Extra,
): Promise<string> {
  const body: MessageBody = { type: 'location', lat, lng };
  return sendMessage(myUid, conv, body, extra?.(body));
}

// Chỉ lưu URL ảnh (đã tải lên Cloudinary) vào Realtime Database
export async function sendImage(
  myUid: string,
  conv: SendTarget,
  imageUrl: string,
  size?: { width?: number; height?: number },
  extra?: Extra,
): Promise<string> {
  const body: MessageBody = { type: 'image', imageUrl };
  if (size?.width && size?.height) {
    body.width = size.width;
    body.height = size.height;
  }
  return sendMessage(myUid, conv, body, extra?.(body));
}

// ---------- Thu hồi và cảm xúc ----------

export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢'] as const;
export type Reaction = (typeof REACTIONS)[number];

// Không xóa node: đánh dấu recalled và xóa nội dung. Nếu là tin cuối của cuộc trò chuyện
// thì sửa luôn dòng tin cuối ở Home của mọi thành viên, cùng một lần update.
export function buildRecallUpdates(
  convId: string,
  msgId: string,
  members: string[],
  isLast: boolean,
): Record<string, unknown> {
  const base = `messages/${convId}/${msgId}`;
  const updates: Record<string, unknown> = {
    [`${base}/recalled`]: true,
    [`${base}/text`]: null,
    [`${base}/imageUrl`]: null,
  };
  if (isLast) {
    for (const uid of members) {
      updates[`userChats/${uid}/${convId}/lastMessage`] = RECALLED_TEXT;
    }
  }
  return updates;
}

export async function recallMessage(
  myUid: string,
  conv: SendTarget,
  msg: Message,
  isLast: boolean,
): Promise<void> {
  if (msg.senderId !== myUid) {
    throw new Error('NOT_OWNER');
  }
  if (!isConnected()) {
    throw new Error('OFFLINE');
  }
  await update(ref(db), buildRecallUpdates(conv.id, msg.id, memberIds(conv), isLast));
}

// Thả lại đúng cảm xúc đang có thì bỏ cảm xúc
export async function toggleReaction(
  convId: string,
  msg: Message,
  myUid: string,
  emoji: Reaction,
  onAdded?: () => Record<string, unknown>, // thông báo cho chủ tin, ghi cùng lệnh update
): Promise<'added' | 'removed'> {
  const current = msg.reactions?.[myUid];
  const next = current === emoji ? null : emoji;
  const extra = next && msg.senderId !== myUid ? (onAdded?.() ?? {}) : {};
  await update(ref(db), { [`messages/${convId}/${msg.id}/reactions/${myUid}`]: next, ...extra });
  return next ? 'added' : 'removed';
}

// Gom cảm xúc để hiển thị: [{ emoji, count, mine }]
export function summarizeReactions(
  reactions: Record<string, string> | undefined,
  myUid: string,
): Array<{ emoji: string; count: number; mine: boolean }> {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const [uid, emoji] of Object.entries(reactions ?? {})) {
    const item = map.get(emoji) ?? { emoji, count: 0, mine: false };
    item.count++;
    item.mine = item.mine || uid === myUid;
    map.set(emoji, item);
  }
  return [...map.values()].sort(
    (a, b) => REACTIONS.indexOf(a.emoji as Reaction) - REACTIONS.indexOf(b.emoji as Reaction),
  );
}

// ---------- Đọc tin nhắn theo trang ----------

const messagesRef = (convId: string) => ref(db, `messages/${convId}`);

export const toMessage = (snap: DataSnapshot): Message => ({ id: snap.key as string, ...snap.val() });

function snapshotToList(snap: DataSnapshot): Message[] {
  const list: Message[] = [];
  snap.forEach(child => {
    list.push(toMessage(child));
  });
  return list;
}

// Khóa push() của Firebase tăng dần theo thời gian, nên sắp theo key là sắp theo thứ tự gửi
export async function fetchLatest(convId: string, size = PAGE_SIZE): Promise<Message[]> {
  const snap = await get(query(messagesRef(convId), orderByKey(), limitToLast(size)));
  return snapshotToList(snap);
}

export async function fetchOlder(convId: string, beforeKey: string, size = PAGE_SIZE): Promise<Message[]> {
  const snap = await get(query(messagesRef(convId), orderByKey(), endBefore(beforeKey), limitToLast(size)));
  return snapshotToList(snap);
}

// Tải toàn bộ đoạn tin từ fromKey (gồm) tới trước beforeKey: dùng khi cần cuộn tới một tin cũ chưa tải
export async function fetchRange(convId: string, fromKey: string, beforeKey: string): Promise<Message[]> {
  const snap = await get(query(messagesRef(convId), orderByKey(), startAt(fromKey), endBefore(beforeKey)));
  return snapshotToList(snap);
}

// Tìm nội dung tin nhắn trong một cuộc trò chuyện (Realtime Database không có tìm kiếm toàn văn,
// nên tải các tin văn bản rồi lọc ở máy). Bỏ dấu để gõ "chao" vẫn tìm được "chào".
export const normalizeText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export function filterMessages(list: Message[], keyword: string): Message[] {
  const q = normalizeText(keyword.trim());
  if (!q) {
    return [];
  }
  return list
    .filter(m => m.type === 'text' && !m.recalled && m.text && normalizeText(m.text).includes(q))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function searchMessages(convId: string, keyword: string): Promise<Message[]> {
  const snap = await get(query(messagesRef(convId), orderByKey()));
  return filterMessages(snapshotToList(snap), keyword);
}

type MessageHandlers = {
  onUpsert: (msg: Message) => void;
  onRemove: (id: string) => void;
};

// Trang mới nhất: nghe tin mới, tin bị sửa (thu hồi, cảm xúc) và tin bị server từ chối
export function subscribeLive(convId: string, fromKey: string | null, h: MessageHandlers): () => void {
  const q = fromKey
    ? query(messagesRef(convId), orderByKey(), startAt(fromKey))
    : query(messagesRef(convId), orderByKey());
  const offs = [
    onChildAdded(q, snap => h.onUpsert(toMessage(snap))),
    onChildChanged(q, snap => h.onUpsert(toMessage(snap))),
    onChildRemoved(q, snap => h.onRemove(snap.key as string)),
  ];
  return () => offs.forEach(off => off());
}

// Các trang cũ đã tải: chỉ cần nghe thay đổi trong đúng khoảng key của trang đó
export function subscribePageChanges(
  convId: string,
  firstKey: string,
  lastKey: string,
  h: MessageHandlers,
): () => void {
  const q = query(messagesRef(convId), orderByKey(), startAt(firstKey), endAt(lastKey));
  const offs = [
    onChildChanged(q, snap => h.onUpsert(toMessage(snap))),
    onChildRemoved(q, snap => h.onRemove(snap.key as string)),
  ];
  return () => offs.forEach(off => off());
}

// ---------- Cuộc trò chuyện ----------

export function subscribeConversation(convId: string, cb: (conv: Conversation | null) => void): () => void {
  return onValue(
    ref(db, `conversations/${convId}`),
    snap => cb(snap.exists() ? { id: convId, ...snap.val() } : null),
    () => cb(null), // bị xóa khỏi nhóm thì mất quyền đọc
  );
}

export async function markAsRead(myUid: string, convId: string): Promise<void> {
  await update(ref(db), {
    [`userChats/${myUid}/${convId}/unread`]: 0,
    [`readStatus/${convId}/${myUid}`]: serverTimestamp(),
  });
}

export function subscribeUserChats(uid: string, cb: (chats: UserChat[]) => void): () => void {
  return onValue(ref(db, `userChats/${uid}`), snap => {
    const val = (snap.val() ?? {}) as Record<string, Partial<UserChat>>;
    const chats = Object.entries(val).map(([convId, c]) => ({
      convId,
      lastMessage: c.lastMessage ?? '',
      lastSenderId: c.lastSenderId,
      lastMsgId: c.lastMsgId,
      updatedAt: c.updatedAt ?? 0,
      unread: c.unread ?? 0,
    }));
    chats.sort((a, b) => b.updatedAt - a.updatedAt);
    cb(chats);
  });
}

export function totalUnread(chats: UserChat[]): number {
  return chats.reduce((sum, c) => sum + c.unread, 0);
}
