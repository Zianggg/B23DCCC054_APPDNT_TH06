jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
let mockKey = 0;
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn((r: { path: string }) => ({ key: `k${++mockKey}`, path: `${r.path}/k${mockKey}` })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  increment: jest.fn((n: number) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 'TS'),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
}));

import { set, update } from 'firebase/database';
import { createGroup, validateGroup } from '../src/services/groupService';

beforeEach(() => {
  jest.clearAllMocks();
  mockKey = 0;
});

describe('validateGroup', () => {
  test('needs a name', () => {
    expect(validateGroup('   ', ['b', 'c'])).toBe('Vui lòng nhập tên nhóm');
  });
  test('needs at least 2 other members', () => {
    expect(validateGroup('Nhóm', ['b'])).toBe('Chọn ít nhất 2 thành viên');
  });
  test('ok', () => {
    expect(validateGroup('Nhóm học', ['b', 'c'])).toBeNull();
  });
});

describe('createGroup', () => {
  test('rejects invalid input without writing', async () => {
    await expect(createGroup('a', 'An', 'Nhóm', ['b'])).rejects.toThrow('Chọn ít nhất 2 thành viên');
    expect(set).not.toHaveBeenCalled();
  });

  test('writes the conversation first, then everything else in ONE update', async () => {
    const convId = await createGroup('a', 'An', ' Nhóm học ', ['b', 'c']);
    expect(convId).toBe('k1');
    expect((set as jest.Mock).mock.calls[0][1]).toEqual({
      type: 'group',
      name: 'Nhóm học',
      members: { a: true, b: true, c: true },
      createdBy: 'a',
      createdAt: 'TS',
    });
    expect(update).toHaveBeenCalledTimes(1);
    const u = (update as jest.Mock).mock.calls[0][1];
    expect(u['messages/k1/k2']).toEqual({
      senderId: 'a',
      type: 'system',
      text: 'An đã tạo nhóm "Nhóm học"',
      createdAt: 'TS',
    });
    for (const uid of ['a', 'b', 'c']) {
      expect(u[`userChats/${uid}/k1/lastMessage`]).toBe('An đã tạo nhóm "Nhóm học"');
      expect(u[`userChats/${uid}/k1/lastSenderId`]).toBeNull();
    }
    expect(u['userChats/b/k1/unread']).toEqual({ inc: 1 });
    expect(u['userChats/c/k1/unread']).toEqual({ inc: 1 });
    expect('userChats/a/k1/unread' in u).toBe(false);

    const notifs = Object.entries(u).filter(([k]) => k.startsWith('notifications/'));
    expect(notifs.map(([k]) => k.split('/')[1]).sort()).toEqual(['b', 'c']);
    expect(notifs[0][1]).toMatchObject({ type: 'group_added', convId: 'k1', fromUid: 'a', read: false });
  });
});
