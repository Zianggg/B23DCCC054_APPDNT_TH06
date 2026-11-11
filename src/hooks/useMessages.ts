import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLatest,
  fetchRange,
  fetchOlder,
  Message,
  PAGE_SIZE,
  subscribeLive,
  subscribePageChanges,
} from '../services/chatService';

// Gộp tin vào map theo id rồi sắp mới -> cũ (FlatList inverted: phần tử 0 nằm dưới cùng).
// Tin cũ được nối vào CUỐI mảng nên danh sách không bị nhảy khi tải thêm.
export function sortNewestFirst(map: Record<string, Message>): Message[] {
  return Object.values(map).sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

type Session = { alive: boolean; unsubs: Array<() => void> };

export function useMessages(convId: string, enabled: boolean) {
  const [map, setMap] = useState<Record<string, Message>>({});
  const [ready, setReady] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const oldestKey = useRef<string | null>(null);
  const busy = useRef(false);
  const more = useRef(false);
  // Mỗi lần đổi cuộc trò chuyện mở một "phiên" mới; kết quả trả về muộn của phiên cũ bị bỏ qua
  const session = useRef<Session>({ alive: false, unsubs: [] });

  const handlers = useMemo(
    () => ({
      onUpsert: (msg: Message) => setMap(prev => ({ ...prev, [msg.id]: msg })),
      onRemove: (id: string) =>
        setMap(prev => {
          if (!(id in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[id];
          return next;
        }),
    }),
    [],
  );

  useEffect(() => {
    const current: Session = { alive: true, unsubs: [] };
    session.current = current;
    setMap({});
    setHasMore(false);
    setLoadingOlder(false);
    more.current = false;
    oldestKey.current = null;
    busy.current = false;
    if (!enabled) {
      setReady(true);
      return () => {
        current.alive = false;
      };
    }
    setReady(false);

    fetchLatest(convId)
      .then(list => {
        if (!current.alive) {
          return;
        }
        setMap(Object.fromEntries(list.map(m => [m.id, m])));
        more.current = list.length === PAGE_SIZE;
        setHasMore(more.current);
        oldestKey.current = list[0]?.id ?? null;
        current.unsubs.push(subscribeLive(convId, oldestKey.current, handlers));
      })
      .catch(() => {})
      .finally(() => {
        if (current.alive) {
          setReady(true);
        }
      });

    return () => {
      current.alive = false;
      current.unsubs.forEach(off => off());
      current.unsubs = [];
    };
  }, [convId, enabled, handlers]);

  const loadOlder = useCallback(async () => {
    const before = oldestKey.current;
    if (!before || busy.current || !more.current) {
      return;
    }
    const current = session.current;
    busy.current = true;
    setLoadingOlder(true);
    try {
      const list = await fetchOlder(convId, before);
      if (!current.alive) {
        return;
      }
      if (list.length > 0) {
        setMap(prev => ({ ...Object.fromEntries(list.map(m => [m.id, m])), ...prev }));
        oldestKey.current = list[0].id;
        current.unsubs.push(subscribePageChanges(convId, list[0].id, list[list.length - 1].id, handlers));
      }
      more.current = list.length === PAGE_SIZE;
      setHasMore(more.current);
    } catch {
      // giữ nguyên, người dùng kéo lên lần nữa để thử lại
    } finally {
      if (current.alive) {
        busy.current = false;
        setLoadingOlder(false);
      }
    }
  }, [convId, handlers]);

  // Bảo đảm tin `id` đã nằm trong danh sách (dùng khi nhấn trích dẫn / kết quả tìm kiếm).
  // Khóa push() tăng theo thời gian nên chỉ cần tải đoạn [id, tin cũ nhất đang có).
  const loadThrough = useCallback(
    async (id: string): Promise<boolean> => {
      const before = oldestKey.current;
      if (!before || id >= before) {
        return true;
      }
      const current = session.current;
      busy.current = true;
      setLoadingOlder(true);
      try {
        const list = await fetchRange(convId, id, before);
        if (!current.alive || list.length === 0) {
          return false;
        }
        setMap(prev => ({ ...Object.fromEntries(list.map(m => [m.id, m])), ...prev }));
        oldestKey.current = list[0].id;
        current.unsubs.push(subscribePageChanges(convId, list[0].id, list[list.length - 1].id, handlers));
        return list[0].id === id;
      } catch {
        return false;
      } finally {
        if (current.alive) {
          busy.current = false;
          setLoadingOlder(false);
        }
      }
    },
    [convId, handlers],
  );

  const messages = useMemo(() => sortNewestFirst(map), [map]);
  return { messages, ready, hasMore, loadingOlder, loadOlder, loadThrough };
}
