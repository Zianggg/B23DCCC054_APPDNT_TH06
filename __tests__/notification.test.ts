jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
let mockKey = 0;
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn(() => ({ key: `n${++mockKey}` })),
  update: jest.fn(() => Promise.resolve()),
  increment: jest.fn((n: number) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 'TS'),
  query: jest.fn(),
  orderByChild: jest.fn(),
  limitToLast: jest.fn(),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
}));

import { update } from 'firebase/database';
import {
  AppNotification,
  buildNotificationUpdates,
  countUnread,
  markAllNotificationsRead,
  messageNotificationText,
  reactionNotificationText,
  recipientsToNotify,
} from '../src/services/notificationService';
import { sendText, toggleReaction } from '../src/services/chatService';
import { formatAgo } from '../src/utils/formatTime';

beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
});

describe('who gets a message notification', () => {
  test('only members not currently in this conversation, never me', () => {
    expect(recipientsToNotify(['me', 'b', 'c', 'd'], 'me', 'g1', { b: 'g1', c: 'other', d: null })).toEqual(['c', 'd']);
  });
});

describe('notification payloads', () => {
  test('one node per recipient, unread, skipping the sender', () => {
    const u = buildNotificationUpdates(['a', 'b'], { type: 'message', convId: 'g1', fromUid: 'a', text: 'x' });
    expect(u).toEqual({
      'notifications/b/n1': { type: 'message', convId: 'g1', fromUid: 'a', text: 'x', createdAt: 'TS', read: false },
    });
  });

  test('texts', () => {
    expect(messageNotificationText('An', 'chào')).toBe('An: chào');
    expect(messageNotificationText('An', '📷 Hình ảnh', 'Nhóm học')).toBe('An trong "Nhóm học": 📷 Hình ảnh');
    expect(reactionNotificationText('An', '❤️', 'hi')).toBe('An đã thả ❤️ vào tin nhắn "hi" của bạn');
  });
});

describe('sending with notifications', () => {
  test('message + notification are written in the SAME update', async () => {
    const conv = { id: 'a_b', type: 'direct' as const, members: { a: true as const, b: true as const }, exists: true };
    await sendText('a', conv, 'hi', body =>
      buildNotificationUpdates(['b'], { type: 'message', convId: 'a_b', fromUid: 'a', text: body.text ?? '' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
    const u = (update as jest.Mock).mock.calls[0][1];
    expect(Object.keys(u)).toEqual(expect.arrayContaining(['messages/a_b/n2', 'notifications/b/n1']));
  });

  test('reaction notifies the owner only when adding to someone else’s message', async () => {
    const notify = jest.fn(() => ({ 'notifications/b/x': {} }));
    const msg = { id: 'm1', senderId: 'b', type: 'text' as const };
    await toggleReaction('g1', msg, 'a', '👍', notify);
    expect(Object.keys((update as jest.Mock).mock.calls[0][1])).toContain('notifications/b/x');

    await toggleReaction('g1', { ...msg, reactions: { a: '👍' } }, 'a', '👍', notify); // gỡ cảm xúc
    await toggleReaction('g1', { ...msg, senderId: 'a' }, 'a', '👍', notify); // tin của chính mình
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('read state', () => {
  const n = (id: string, read: boolean): AppNotification => ({
    id,
    read,
    type: 'message',
    convId: 'c',
    fromUid: 'b',
    text: '',
    createdAt: 1,
  });

  test('countUnread', () => {
    expect(countUnread([n('1', false), n('2', true), n('3', false)])).toBe(2);
  });

  test('mark all read = one multi-path update of unread items only', async () => {
    await markAllNotificationsRead('me', [n('1', false), n('2', true), n('3', false)]);
    expect(update).toHaveBeenCalledTimes(1);
    expect((update as jest.Mock).mock.calls[0][1]).toEqual({
      'notifications/me/1/read': true,
      'notifications/me/3/read': true,
    });
  });

  test('nothing unread: no write', async () => {
    await markAllNotificationsRead('me', [n('2', true)]);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('formatAgo', () => {
  const now = 10_000_000;
  test('relative times', () => {
    expect(formatAgo(now - 10_000, now)).toBe('Vừa xong');
    expect(formatAgo(now - 3 * 60_000, now)).toBe('3 phút trước');
    expect(formatAgo(now - 2 * 3_600_000, now)).toBe('2 giờ trước');
  });
});
