import { useCallback, useEffect, useRef, useState } from 'react';
import { setTyping } from '../services/presenceService';

export const TYPING_TIMEOUT_MS = 3000;

// Bật typing khi gõ; tự tắt sau 3 giây không gõ, khi ô nhập trống (vừa gửi) hoặc khi rời màn
export function useTyping(convId: string, uid: string, enabled: boolean) {
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (typing.current) {
      typing.current = false;
      setTyping(convId, uid, false).catch(() => {});
    }
  }, [convId, uid]);

  const onTextChange = useCallback(
    (text: string) => {
      if (!enabled || !text.trim()) {
        stop();
        return;
      }
      if (!typing.current) {
        typing.current = true;
        setTyping(convId, uid, true).catch(() => {
          typing.current = false;
        });
      }
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(stop, TYPING_TIMEOUT_MS);
    },
    [convId, uid, enabled, stop],
  );

  // Rời màn hoặc đổi cuộc trò chuyện
  useEffect(() => stop, [stop]);

  return { onTextChange, stop };
}

// Thời điểm hiện tại, cập nhật định kỳ để các chữ "X phút trước" tự đổi
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
