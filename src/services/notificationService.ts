import { limitToLast, onValue, orderByChild, push, query, ref, serverTimestamp, update } from 'firebase/database';
import { db } from './firebase';

export type NotificationType = 'message' | 'group_added' | 'reaction';

export type AppNotification = {
  id: string;
  type: NotificationType;
  convId: string;
  fromUid: string;
  text: string;
  createdAt: number;
  read: boolean;
};

type NewNotification = Pick<AppNotification, 'type' | 'convId' | 'fromUid' | 'text'>;

export const NOTIFICATION_LIMIT = 100;

// Các đường dẫn để ghi thông báo vào notifications/{uid}/{id}, gộp được vào một lệnh update() khác
export function buildNotificationUpdates(toUids: string[], n: NewNotification): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const uid of toUids) {
    if (uid === n.fromUid) {
      continue; // không tự thông báo cho chính mình
    }
    const key = push(ref(db, `notifications/${uid}`)).key as string;
    updates[`notifications/${uid}/${key}`] = { ...n, createdAt: serverTimestamp(), read: false };
  }
  return updates;
}

// Người nhận cần thông báo tin mới: thành viên khác mình KHÔNG đang mở đúng cuộc trò chuyện này
export function recipientsToNotify(
  memberUids: string[],
  myUid: string,
  convId: string,
  activeConv: Record<string, string | null | undefined>,
): string[] {
  return memberUids.filter(uid => uid !== myUid && activeConv[uid] !== convId);
}

const shortName = (name: string | undefined) => name?.trim() || 'Ai đó';

export function messageNotificationText(senderName: string | undefined, preview: string, groupName?: string): string {
  return groupName
    ? `${shortName(senderName)} trong "${groupName}": ${preview}`
    : `${shortName(senderName)}: ${preview}`;
}

export function reactionNotificationText(senderName: string | undefined, emoji: string, preview: string): string {
  const quote = preview.length > 40 ? `${preview.slice(0, 40)}…` : preview;
  return `${shortName(senderName)} đã thả ${emoji} vào tin nhắn "${quote}" của bạn`;
}

export function subscribeNotifications(uid: string, cb: (list: AppNotification[]) => void): () => void {
  const q = query(ref(db, `notifications/${uid}`), orderByChild('createdAt'), limitToLast(NOTIFICATION_LIMIT));
  return onValue(
    q,
    snap => {
      const list: AppNotification[] = [];
      snap.forEach(child => {
        list.push({ id: child.key as string, ...child.val() });
      });
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(list);
    },
    () => cb([]),
  );
}

export const countUnread = (list: AppNotification[]) => list.filter(n => !n.read).length;

export async function markNotificationRead(uid: string, id: string): Promise<void> {
  await update(ref(db), { [`notifications/${uid}/${id}/read`]: true });
}

// "Đánh dấu tất cả đã đọc" trong một lệnh update nhiều đường dẫn
export async function markAllNotificationsRead(uid: string, list: AppNotification[]): Promise<void> {
  const updates: Record<string, boolean> = {};
  for (const n of list) {
    if (!n.read) {
      updates[`notifications/${uid}/${n.id}/read`] = true;
    }
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}
