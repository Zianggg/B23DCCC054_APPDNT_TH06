jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
let mockKey = 0;
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn(() => ({ key: `k${++mockKey}` })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(),
  increment: jest.fn((n: number) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 'TS'),
  query: jest.fn(),
  orderByKey: jest.fn(),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
}));

import { update } from 'firebase/database';
import {
  filterMessages,
  makeReplyRef,
  Message,
  normalizeText,
  sendText,
} from '../src/services/chatService';
import { addMembers, leaveGroup, removeMember, renameGroup } from '../src/services/groupService';

const updateMock = update as jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
});

const group = { id: 'g1', name: 'Nhóm', createdBy: 'a', members: { a: true as const, b: true as const, c: true as const } };

describe('reply', () => {
  test('reply ref keeps id, sender and a short preview', () => {
    const long = 'x'.repeat(200);
    const ref = makeReplyRef({ id: 'm1', senderId: 'b', type: 'text', text: long });
    expect(ref.id).toBe('m1');
    expect(ref.senderId).toBe('b');
    expect(ref.preview.length).toBeLessThanOrEqual(81);
  });

  test('recalled / image messages quote safely', () => {
    expect(makeReplyRef({ id: 'm', senderId: 'b', type: 'text', recalled: true }).preview).toBe('Tin nhắn đã được thu hồi');
    expect(makeReplyRef({ id: 'm', senderId: 'b', type: 'image', imageUrl: 'u' }).preview).toBe('📷 Hình ảnh');
  });

  test('sendText stores replyTo on the message', async () => {
    const conv = { ...group, type: 'group' as const, exists: true };
    await sendText('a', conv, 'ok', undefined, { id: 'm1', senderId: 'b', preview: 'hi' });
    const msg = updateMock.mock.calls[0][1]['messages/g1/k1'];
    expect(msg.replyTo).toEqual({ id: 'm1', senderId: 'b', preview: 'hi' });
  });
});

describe('search', () => {
  const m = (id: string, text: string, extra: Partial<Message> = {}): Message => ({
    id,
    senderId: 'a',
    type: 'text',
    text,
    ...extra,
  });

  test('accent-insensitive, newest first, skips recalled and non-text', () => {
    const list = [
      m('1', 'Chào cả nhóm'),
      m('2', 'chao buoi sang'),
      m('3', 'Chào', { recalled: true }),
      { id: '4', senderId: 'a', type: 'image' as const, imageUrl: 'u' },
      m('5', 'tạm biệt'),
    ];
    expect(filterMessages(list, 'CHAO').map(x => x.id)).toEqual(['2', '1']);
    expect(filterMessages(list, '   ')).toEqual([]);
    expect(normalizeText('Đường đi')).toBe('duong di');
  });
});

describe('group admin', () => {
  test('rename: name + system message in one update, admin only', async () => {
    await renameGroup(group, 'a', 'An', ' Lớp ');
    const u = updateMock.mock.calls[0][1];
    expect(u['conversations/g1/name']).toBe('Lớp');
    expect(u['messages/g1/k1']).toMatchObject({ type: 'system', text: 'An đã đổi tên nhóm thành "Lớp"' });
    await expect(renameGroup(group, 'b', 'Bình', 'X')).rejects.toThrow('NOT_ADMIN');
  });

  test('add: members first, then system message + userChats + notification', async () => {
    await addMembers(group, 'a', 'An', ['d', 'b'], { d: 'Dũng' });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[0][1]).toEqual({ 'conversations/g1/members/d': true });
    const u = updateMock.mock.calls[1][1];
    expect(u['messages/g1/k1'].text).toBe('An đã thêm Dũng vào nhóm');
    expect(u['userChats/d/g1/unread']).toEqual({ inc: 1 });
    expect(Object.keys(u).some(k => k.startsWith('notifications/d/'))).toBe(true);
  });

  test('remove: one update drops membership and the Home row', async () => {
    await removeMember(group, 'a', 'An', 'c', 'Chi');
    const u = updateMock.mock.calls[0][1];
    expect(u['conversations/g1/members/c']).toBeNull();
    expect(u['userChats/c/g1']).toBeNull();
    expect(u['messages/g1/k1'].text).toBe('An đã xóa Chi khỏi nhóm');
    expect('userChats/c/g1/lastMessage' in u).toBe(false);
  });

  test('leave: "A đã rời nhóm" and admin hands over to another member', async () => {
    await leaveGroup(group, 'a', 'An');
    const u = updateMock.mock.calls[0][1];
    expect(u['messages/g1/k1']).toMatchObject({ type: 'system', text: 'An đã rời nhóm' });
    expect(u['conversations/g1/members/a']).toBeNull();
    expect(u['userChats/a/g1']).toBeNull();
    expect(u['conversations/g1/createdBy']).toBe('b');
  });

  test('a normal member leaving does not touch createdBy', async () => {
    await leaveGroup(group, 'c', 'Chi');
    expect('conversations/g1/createdBy' in updateMock.mock.calls[0][1]).toBe(false);
  });
});
