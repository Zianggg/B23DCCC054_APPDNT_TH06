jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn(() => ({ key: 'K' })),
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(),
  increment: jest.fn((n: number) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 'TS'),
  runTransaction: jest.fn(() => Promise.resolve()),
  query: jest.fn((r: unknown, ...c: unknown[]) => ({ r, c })),
  orderByKey: jest.fn(() => 'orderByKey'),
  limitToLast: jest.fn((n: number) => `limitToLast(${n})`),
  endBefore: jest.fn((k: string) => `endBefore(${k})`),
  startAt: jest.fn((k: string) => `startAt(${k})`),
  endAt: jest.fn((k: string) => `endAt(${k})`),
  onChildAdded: jest.fn(() => jest.fn()),
  onChildChanged: jest.fn(() => jest.fn()),
  onChildRemoved: jest.fn(() => jest.fn()),
  onDisconnect: jest.fn(),
  onValue: jest.fn(),
}));

import { get, onChildAdded, onValue, query, runTransaction, update } from 'firebase/database';
import {
  buildRecallUpdates,
  buildSendUpdates,
  recallMessage,
  summarizeReactions,
  toggleReaction,
  fetchLatest,
  fetchOlder,
  markAsRead,
  previewOf,
  SendTarget,
  sendLocation,
  sendText,
  subscribeLive,
  subscribeUserChats,
  totalUnread,
  UserChat,
} from '../src/services/chatService';
import { sortNewestFirst } from '../src/hooks/useMessages';

const updateMock = update as jest.Mock;

const direct: SendTarget = { id: 'a_b', type: 'direct', members: { a: true, b: true }, exists: true };
const group: SendTarget = { id: 'g1', type: 'group', members: { a: true, b: true, c: true }, exists: true };

beforeEach(() => jest.clearAllMocks());

describe('buildSendUpdates (multi-path)', () => {
  test('message, lastMessage of every member and increment(1) for the others', () => {
    const u = buildSendUpdates('g1', ['a', 'b', 'c'], 'a', 'K', { type: 'text', text: 'hi' });
    expect(u['messages/g1/K']).toEqual({ senderId: 'a', type: 'text', text: 'hi', createdAt: 'TS' });
    for (const uid of ['a', 'b', 'c']) {
      expect(u[`userChats/${uid}/g1/lastMessage`]).toBe('hi');
      expect(u[`userChats/${uid}/g1/lastSenderId`]).toBe('a');
      expect(u[`userChats/${uid}/g1/lastMsgId`]).toBe('K');
      expect(u[`userChats/${uid}/g1/updatedAt`]).toBe('TS');
    }
    expect(u['userChats/b/g1/unread']).toEqual({ inc: 1 });
    expect(u['userChats/c/g1/unread']).toEqual({ inc: 1 });
    // của chính mình: không đụng tới số chưa đọc
    expect('userChats/a/g1/unread' in u).toBe(false);
    expect(u['readStatus/g1/a']).toBe('TS');
  });

  test('previewOf', () => {
    expect(previewOf({ type: 'image', imageUrl: 'x' })).toBe('📷 Hình ảnh');
    expect(previewOf({ type: 'location', lat: 1, lng: 2 })).toBe('📍 Vị trí');
    expect(previewOf({ type: 'text', text: 'chào' })).toBe('chào');
  });
});

describe('sendText', () => {
  test('rejects blank text without writing', async () => {
    await expect(sendText('a', direct, '   ')).rejects.toThrow('EMPTY');
    expect(updateMock).not.toHaveBeenCalled();
  });

  test('writes everything in ONE update call', async () => {
    await sendText('b', group, ' hi ');
    expect(updateMock).toHaveBeenCalledTimes(1);
    const updates = updateMock.mock.calls[0][1];
    expect(updates['messages/g1/K'].text).toBe('hi');
    expect(updates['userChats/a/g1/unread']).toEqual({ inc: 1 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  test('creates the direct conversation first when it does not exist yet', async () => {
    await sendText('a', { ...direct, exists: false }, 'hi');
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect((runTransaction as jest.Mock).mock.calls[0][0]).toEqual({ path: 'conversations/a_b' });
    const create = (runTransaction as jest.Mock).mock.calls[0][1];
    expect(create(null)).toEqual({
      type: 'direct',
      members: { a: true, b: true },
      createdBy: 'a',
      createdAt: 'TS',
    });
    expect(create({ type: 'direct' })).toBeUndefined(); // đã có thì không ghi đè
  });
});

describe('sendLocation', () => {
  test('writes a location message with preview text', async () => {
    await sendLocation('a', direct, 21.0285, 105.8542);
    const updates = updateMock.mock.calls[0][1];
    expect(updates['messages/a_b/K']).toEqual({
      senderId: 'a',
      type: 'location',
      lat: 21.0285,
      lng: 105.8542,
      createdAt: 'TS',
    });
    expect(updates['userChats/b/a_b/lastMessage']).toBe('📍 Vị trí');
  });
});

describe('markAsRead', () => {
  test('resets my unread counter and records read time', async () => {
    await markAsRead('a', 'g1');
    expect(updateMock).toHaveBeenCalledWith(
      { path: undefined },
      { 'userChats/a/g1/unread': 0, 'readStatus/g1/a': 'TS' },
    );
  });
});

describe('pagination', () => {
  const snapOf = (keys: string[]) => ({
    forEach: (fn: (c: unknown) => void) =>
      keys.forEach(k => fn({ key: k, val: () => ({ senderId: 'a', type: 'text', text: k }) })),
  });

  test('first page uses orderByKey + limitToLast(20)', async () => {
    (get as jest.Mock).mockResolvedValue(snapOf(['m1', 'm2']));
    const list = await fetchLatest('g1');
    expect(query).toHaveBeenCalledWith({ path: 'messages/g1' }, 'orderByKey', 'limitToLast(20)');
    expect(list.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  test('older page ends before the oldest loaded key', async () => {
    (get as jest.Mock).mockResolvedValue(snapOf([]));
    await fetchOlder('g1', 'm1');
    expect(query).toHaveBeenCalledWith({ path: 'messages/g1' }, 'orderByKey', 'endBefore(m1)', 'limitToLast(20)');
  });

  test('live listener starts at the oldest key and unsubscribes all three', () => {
    const offs = [jest.fn(), jest.fn(), jest.fn()];
    (onChildAdded as jest.Mock).mockReturnValueOnce(offs[0]);
    const { onChildChanged, onChildRemoved } = jest.requireMock('firebase/database');
    onChildChanged.mockReturnValueOnce(offs[1]);
    onChildRemoved.mockReturnValueOnce(offs[2]);
    const stop = subscribeLive('g1', 'm1', { onUpsert: jest.fn(), onRemove: jest.fn() });
    expect(query).toHaveBeenCalledWith({ path: 'messages/g1' }, 'orderByKey', 'startAt(m1)');
    stop();
    offs.forEach(off => expect(off).toHaveBeenCalled());
  });

  test('sortNewestFirst orders by push key descending', () => {
    const m = (id: string) => ({ id, senderId: 'a', type: 'text' as const });
    expect(sortNewestFirst({ b: m('b'), a: m('a'), c: m('c') }).map(x => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('subscribeUserChats', () => {
  test('sorts newest conversation first', () => {
    const cb = jest.fn();
    (onValue as jest.Mock).mockImplementation((_r, handler) => {
      handler({
        val: () => ({
          a_b: { updatedAt: 1, unread: 2, lastMessage: 'x' },
          g1: { updatedAt: 5, unread: 0, lastMessage: 'y' },
        }),
      });
      return jest.fn();
    });
    subscribeUserChats('a', cb);
    const chats: UserChat[] = cb.mock.calls[0][0];
    expect(chats.map(c => c.convId)).toEqual(['g1', 'a_b']);
    expect(totalUnread(chats)).toBe(2);
  });

  test('empty node gives empty list', () => {
    const cb = jest.fn();
    (onValue as jest.Mock).mockImplementation((_r, handler) => {
      handler({ val: () => null });
      return jest.fn();
    });
    subscribeUserChats('a', cb);
    expect(cb).toHaveBeenCalledWith([]);
  });
});

describe('recall', () => {
  test('marks recalled and clears content, never deletes the node', () => {
    const u = buildRecallUpdates('g1', 'm1', ['a', 'b'], false);
    expect(u).toEqual({ 'messages/g1/m1/recalled': true, 'messages/g1/m1/text': null, 'messages/g1/m1/imageUrl': null });
    expect(Object.values(u).every(v => v !== undefined)).toBe(true);
  });

  test('last message: updates lastMessage of every member in the same update', () => {
    const u = buildRecallUpdates('g1', 'm1', ['a', 'b', 'c'], true);
    expect(u['userChats/a/g1/lastMessage']).toBe('Tin nhắn đã được thu hồi');
    expect(u['userChats/c/g1/lastMessage']).toBe('Tin nhắn đã được thu hồi');
  });

  test("cannot recall someone else's message", async () => {
    await expect(
      recallMessage('a', group, { id: 'm1', senderId: 'b', type: 'text' }, false),
    ).rejects.toThrow('NOT_OWNER');
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('reactions', () => {
  const msg = { id: 'm1', senderId: 'b', type: 'text' as const, reactions: { a: '❤️' } };

  test('writes only my own reaction path', async () => {
    await toggleReaction('g1', msg, 'a', '👍');
    expect(updateMock.mock.calls[0][1]).toEqual({ 'messages/g1/m1/reactions/a': '👍' });
  });

  test('same emoji again removes it', async () => {
    await expect(toggleReaction('g1', msg, 'a', '❤️')).resolves.toBe('removed');
    expect(updateMock.mock.calls[0][1]).toEqual({ 'messages/g1/m1/reactions/a': null });
  });

  test('summary counts per emoji in fixed order and flags mine', () => {
    expect(summarizeReactions({ a: '😂', b: '👍', c: '😂' }, 'a')).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '😂', count: 2, mine: true },
    ]);
  });
});
