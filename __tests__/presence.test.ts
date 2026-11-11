jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
const mockSet = jest.fn(() => Promise.resolve());
const mockRemove = jest.fn(() => Promise.resolve());
const mockDisconnect = { remove: jest.fn(() => Promise.resolve()), cancel: jest.fn(() => Promise.resolve()) };
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  set: (...a: unknown[]) => (mockSet as any)(...a),
  remove: (...a: unknown[]) => (mockRemove as any)(...a),
  onDisconnect: jest.fn(() => mockDisconnect),
  onValue: jest.fn(),
}));

import { onDisconnect } from 'firebase/database';
import { seenInfo, setTyping } from '../src/services/presenceService';

beforeEach(() => jest.clearAllMocks());

describe('seenInfo', () => {
  test('not seen when nobody read after the message', () => {
    expect(seenInfo(100, { b: 50 }, ['b'])).toEqual({ seen: false, seenAt: undefined, seenCount: 0 });
  });

  test('seen with the latest read time', () => {
    expect(seenInfo(100, { b: 150, c: 120, me: 999 }, ['b', 'c'])).toEqual({
      seen: true,
      seenAt: 150,
      seenCount: 2,
    });
  });

  test('message without server time is not seen', () => {
    expect(seenInfo(undefined, { b: 150 }, ['b']).seen).toBe(false);
  });
});

describe('setTyping', () => {
  test('typing on registers onDisconnect().remove() before writing', async () => {
    await setTyping('c1', 'me', true);
    expect(onDisconnect).toHaveBeenCalledWith({ path: 'typing/c1/me' });
    expect(mockDisconnect.remove).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ path: 'typing/c1/me' }, true);
  });

  test('typing off removes the node and cancels onDisconnect', async () => {
    await setTyping('c1', 'me', false);
    expect(mockRemove).toHaveBeenCalledWith({ path: 'typing/c1/me' });
    expect(mockDisconnect.cancel).toHaveBeenCalled();
  });
});
