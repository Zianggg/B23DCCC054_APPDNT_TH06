import { onDisconnect, onValue, ref, remove, set } from 'firebase/database';
import { db } from './firebase';

// ---------- Đang soạn tin: typing/{convId}/{uid} = true ----------

export async function setTyping(convId: string, uid: string, typing: boolean): Promise<void> {
  const r = ref(db, `typing/${convId}/${uid}`);
  if (typing) {
    // Tắt app đột ngột thì server tự xóa, không bị kẹt "đang soạn tin…"
    await onDisconnect(r).remove();
    await set(r, true);
  } else {
    await remove(r);
    await onDisconnect(r).cancel();
  }
}

// Danh sách uid KHÁC mình đang gõ
export function subscribeTyping(convId: string, myUid: string, cb: (uids: string[]) => void): () => void {
  return onValue(
    ref(db, `typing/${convId}`),
    snap => cb(Object.keys(snap.val() ?? {}).filter(uid => uid !== myUid)),
    () => cb([]),
  );
}

// ---------- Đã xem: readStatus/{convId}/{uid} = thời điểm đọc cuối ----------

export function subscribeReadStatus(convId: string, cb: (status: Record<string, number>) => void): () => void {
  return onValue(
    ref(db, `readStatus/${convId}`),
    snap => cb((snap.val() ?? {}) as Record<string, number>),
    () => cb({}),
  );
}

// ---------- Cuộc trò chuyện đang mở: activeConv/{uid} = convId ----------
// Người gửi đọc nhánh này để biết có cần ghi thông báo cho người nhận hay không.

export async function setActiveConv(uid: string, convId: string | null): Promise<void> {
  const r = ref(db, `activeConv/${uid}`);
  if (convId) {
    await onDisconnect(r).remove();
    await set(r, convId);
  } else {
    await remove(r);
    await onDisconnect(r).cancel();
  }
}

// Cuộc trò chuyện mà từng thành viên đang mở (để quyết định có ghi thông báo hay không)
export function subscribeActiveConvs(
  uids: string[],
  cb: (active: Record<string, string | null>) => void,
): () => void {
  const state: Record<string, string | null> = {};
  const offs = uids.map(uid =>
    onValue(
      ref(db, `activeConv/${uid}`),
      snap => {
        state[uid] = snap.val() ?? null;
        cb({ ...state });
      },
      () => {},
    ),
  );
  return () => offs.forEach(off => off());
}

export type SeenInfo = { seen: boolean; seenAt?: number; seenCount: number };

// Tin của mình đã được bao nhiêu người khác xem (readStatus >= createdAt)
export function seenInfo(
  createdAt: number | undefined,
  readStatus: Record<string, number>,
  otherUids: string[],
): SeenInfo {
  if (!createdAt) {
    return { seen: false, seenCount: 0 };
  }
  const times = otherUids.map(uid => readStatus[uid]).filter((t): t is number => typeof t === 'number' && t >= createdAt);
  return {
    seen: times.length > 0,
    seenAt: times.length > 0 ? Math.max(...times) : undefined,
    seenCount: times.length,
  };
}
