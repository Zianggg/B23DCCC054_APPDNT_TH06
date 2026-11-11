import type { Conversation } from '../services/chatService';
import type { AppUser } from '../services/userService';

export type ChatDisplay = {
  title: string;
  avatarUid: string;
  isGroup: boolean;
  otherUid?: string;
  online?: boolean; // chỉ có với chat 1-1
};

// Tên, avatar và trạng thái hiển thị của một cuộc trò chuyện (1-1 hoặc nhóm)
export function chatDisplay(
  conv: Pick<Conversation, 'id' | 'type' | 'name' | 'members'> | undefined,
  myUid: string,
  users: Record<string, AppUser>,
  fallbackOtherUid?: string,
): ChatDisplay {
  if (conv?.type === 'group') {
    return { title: conv.name || 'Nhóm', avatarUid: conv.id, isGroup: true };
  }
  const otherUid = (conv && Object.keys(conv.members ?? {}).find(uid => uid !== myUid)) ?? fallbackOtherUid;
  const other = otherUid ? users[otherUid] : undefined;
  return {
    title: other?.name || 'Người dùng',
    avatarUid: otherUid ?? conv?.id ?? '',
    isGroup: false,
    otherUid,
    online: !!other?.online,
  };
}

// Tiền tố "Bạn: " / "Tên: " cho dòng tin cuối ở Home
export function previewWithSender(
  lastMessage: string,
  lastSenderId: string | undefined,
  myUid: string,
  isGroup: boolean,
  users: Record<string, AppUser>,
): string {
  if (!lastMessage || !lastSenderId) {
    return lastMessage;
  }
  if (lastSenderId === myUid) {
    return `Bạn: ${lastMessage}`;
  }
  if (isGroup) {
    const name = users[lastSenderId]?.name?.split(' ').slice(-1)[0];
    return name ? `${name}: ${lastMessage}` : lastMessage;
  }
  return lastMessage;
}
