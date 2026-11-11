import { push, ref, serverTimestamp, set, update } from 'firebase/database';
import { db } from './firebase';
import { isConnected } from './userService';
import { buildSendUpdates } from './chatService';
import { buildNotificationUpdates } from './notificationService';

export const MIN_OTHER_MEMBERS = 2;
export const MAX_GROUP_NAME = 50;

export function validateGroup(name: string, otherUids: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Vui lòng nhập tên nhóm';
  }
  if (trimmed.length > MAX_GROUP_NAME) {
    return `Tên nhóm tối đa ${MAX_GROUP_NAME} ký tự`;
  }
  if (otherUids.length < MIN_OTHER_MEMBERS) {
    return `Chọn ít nhất ${MIN_OTHER_MEMBERS} thành viên`;
  }
  return null;
}

// Tạo nhóm:
//  1) ghi conversations/{id} (luật bảo mật cần node này có trước để xác nhận thành viên);
//  2) MỘT lệnh update(): tin hệ thống "X đã tạo nhóm", userChats của mọi thành viên,
//     số chưa đọc increment(1) và thông báo "được thêm vào nhóm".
export async function createGroup(
  myUid: string,
  myName: string,
  name: string,
  otherUids: string[],
): Promise<string> {
  const error = validateGroup(name, otherUids);
  if (error) {
    throw new Error(error);
  }
  if (!isConnected()) {
    throw new Error('OFFLINE');
  }
  const trimmed = name.trim();
  const memberUids = [myUid, ...otherUids.filter(uid => uid !== myUid)];
  const convRef = push(ref(db, 'conversations'));
  const convId = convRef.key as string;

  await set(convRef, {
    type: 'group',
    name: trimmed,
    members: Object.fromEntries(memberUids.map(uid => [uid, true])),
    createdBy: myUid,
    createdAt: serverTimestamp(),
  });

  const msgKey = push(ref(db, `messages/${convId}`)).key as string;
  await update(ref(db), {
    ...buildSendUpdates(convId, memberUids, myUid, msgKey, {
      type: 'system',
      text: `${myName} đã tạo nhóm "${trimmed}"`,
    }),
    ...buildNotificationUpdates(otherUids, {
      type: 'group_added',
      convId,
      fromUid: myUid,
      text: `${myName} đã thêm bạn vào nhóm "${trimmed}"`,
    }),
  });
  return convId;
}

// ---------- Quản trị nhóm ----------
// Trưởng nhóm (createdBy) được đổi tên, thêm và xóa thành viên; ai cũng rời nhóm được.

type GroupRef = { id: string; members: Record<string, true>; createdBy: string; name?: string };

export const isGroupAdmin = (conv: Pick<GroupRef, 'createdBy'>, uid: string) => conv.createdBy === uid;

// Tin hệ thống + lastMessage/unread cho danh sách thành viên `audience`
function systemMessageUpdates(convId: string, audience: string[], actorUid: string, text: string) {
  const key = push(ref(db, `messages/${convId}`)).key as string;
  return buildSendUpdates(convId, audience, actorUid, key, { type: 'system', text });
}

function ensureOnline() {
  if (!isConnected()) {
    throw new Error('OFFLINE');
  }
}

export async function renameGroup(conv: GroupRef, myUid: string, myName: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Vui lòng nhập tên nhóm');
  }
  if (trimmed.length > MAX_GROUP_NAME) {
    throw new Error(`Tên nhóm tối đa ${MAX_GROUP_NAME} ký tự`);
  }
  if (!isGroupAdmin(conv, myUid)) {
    throw new Error('NOT_ADMIN');
  }
  ensureOnline();
  await update(ref(db), {
    [`conversations/${conv.id}/name`]: trimmed,
    ...systemMessageUpdates(conv.id, Object.keys(conv.members), myUid, `${myName} đã đổi tên nhóm thành "${trimmed}"`),
  });
}

// 1) thêm vào members (luật bảo mật cần có tư cách thành viên trước khi ghi userChats của họ);
// 2) một lệnh update: tin hệ thống cho cả nhóm + userChats của người mới + thông báo "được thêm vào nhóm"
export async function addMembers(
  conv: GroupRef,
  myUid: string,
  myName: string,
  newUids: string[],
  names: Record<string, string>,
): Promise<void> {
  const fresh = newUids.filter(uid => !conv.members[uid]);
  if (fresh.length === 0) {
    return;
  }
  if (!isGroupAdmin(conv, myUid)) {
    throw new Error('NOT_ADMIN');
  }
  ensureOnline();
  await update(
    ref(db),
    Object.fromEntries(fresh.map(uid => [`conversations/${conv.id}/members/${uid}`, true])),
  );
  const everyone = [...Object.keys(conv.members), ...fresh];
  const who = fresh.map(uid => names[uid] ?? 'thành viên mới').join(', ');
  await update(ref(db), {
    ...systemMessageUpdates(conv.id, everyone, myUid, `${myName} đã thêm ${who} vào nhóm`),
    ...buildNotificationUpdates(fresh, {
      type: 'group_added',
      convId: conv.id,
      fromUid: myUid,
      text: `${myName} đã thêm bạn vào nhóm "${conv.name ?? 'Nhóm'}"`,
    }),
  });
}

// Một lệnh update: xóa khỏi members, xóa dòng nhóm ở Home của người đó, tin hệ thống cho người còn lại
export async function removeMember(
  conv: GroupRef,
  myUid: string,
  myName: string,
  uid: string,
  name: string,
): Promise<void> {
  if (!isGroupAdmin(conv, myUid)) {
    throw new Error('NOT_ADMIN');
  }
  if (uid === myUid) {
    throw new Error('Dùng "Rời nhóm" để tự rời khỏi nhóm');
  }
  ensureOnline();
  const remaining = Object.keys(conv.members).filter(m => m !== uid);
  await update(ref(db), {
    [`conversations/${conv.id}/members/${uid}`]: null,
    [`userChats/${uid}/${conv.id}`]: null,
    ...systemMessageUpdates(conv.id, remaining, myUid, `${myName} đã xóa ${name} khỏi nhóm`),
  });
}

// Rời nhóm: tin hệ thống "A đã rời nhóm". Nếu là trưởng nhóm thì chuyển quyền cho người còn lại đầu tiên.
export async function leaveGroup(conv: GroupRef, myUid: string, myName: string): Promise<void> {
  const remaining = Object.keys(conv.members).filter(m => m !== myUid);
  if (remaining.length === 0) {
    throw new Error('Bạn là thành viên cuối cùng của nhóm');
  }
  ensureOnline();
  const updates: Record<string, unknown> = {
    ...systemMessageUpdates(conv.id, remaining, myUid, `${myName} đã rời nhóm`),
    [`conversations/${conv.id}/members/${myUid}`]: null,
    [`userChats/${myUid}/${conv.id}`]: null,
    [`readStatus/${conv.id}/${myUid}`]: null,
  };
  if (isGroupAdmin(conv, myUid)) {
    updates[`conversations/${conv.id}/createdBy`] = remaining[0];
  }
  await update(ref(db), updates);
}
