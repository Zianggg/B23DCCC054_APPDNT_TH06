import { PermissionsAndroid, Platform } from 'react-native';

jest.mock('@react-native-community/geolocation', () => ({}));

jest.mock('../src/services/firebase', () => ({ auth: { currentUser: null }, db: {} }));

const mockAuthHandlers: Array<(u: unknown) => void> = [];
let mockResolveSet: () => void = () => {};
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_a, h) => {
    mockAuthHandlers.push(h);
    return jest.fn();
  }),
  createUserWithEmailAndPassword: jest.fn(async () => {
    const user = { uid: 'u1' };
    mockAuthHandlers.forEach(h => h(user)); // Firebase báo đăng nhập ngay khi tạo xong
    return { user };
  }),
  updateProfile: jest.fn(() => Promise.resolve()),
  signOut: jest.fn(() => Promise.resolve()),
  signInWithEmailAndPassword: jest.fn(),
}));

let mockConnected = true;
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn(() => ({ key: 'K' })),
  update: jest.fn(() => Promise.resolve()),
  set: jest.fn(() => new Promise<void>(r => (mockResolveSet = r))),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
  query: jest.fn((r: unknown) => r),
  orderByKey: jest.fn(),
  startAt: jest.fn(),
  runTransaction: jest.fn(() => Promise.resolve()),
  onChildAdded: jest.fn(() => jest.fn()),
  onChildChanged: jest.fn(() => jest.fn()),
  onChildRemoved: jest.fn(),
  onValue: jest.fn((r: { path: string }, h: (s: unknown) => void) => {
    if (r.path === '.info/connected') {
      h({ val: () => mockConnected });
    }
    return jest.fn();
  }),
  onDisconnect: jest.fn(() => ({
    update: () => Promise.resolve(),
    cancel: () => new Promise(() => {}), // mất mạng: không bao giờ resolve
  })),
}));

import { onChildRemoved, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { sendText, subscribeLive } from '../src/services/chatService';
import { logout, register, subscribeAuth } from '../src/services/authService';
import { startPresence } from '../src/services/userService';
import { requestLocationPermission } from '../src/services/locationService';

describe('offline send (Important 1)', () => {
  test('sendText rejects with OFFLINE and writes nothing when disconnected', async () => {
    mockConnected = false;
    startPresence('me');
    (update as jest.Mock).mockClear();
    const target = { id: 'b_me', type: 'direct' as const, members: { me: true as const, b: true as const }, exists: false };
    await expect(sendText('me', target, 'hi')).rejects.toThrow('OFFLINE');
    expect(update).not.toHaveBeenCalled();
    mockConnected = true;
    startPresence('me');
  });
});

describe('offline logout (Important 1)', () => {
  test('signOut still runs when setOffline never resolves', async () => {
    jest.useFakeTimers();
    const p = logout('me');
    await jest.advanceTimersByTimeAsync(3500);
    await p;
    expect(signOut).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('rejected write (Important 2)', () => {
  test('subscribeLive reports removed ids and unsubscribes its listeners', () => {
    const unsubRemoved = jest.fn();
    (onChildRemoved as jest.Mock).mockImplementation((_q, h) => {
      h({ key: 'm1' });
      return unsubRemoved;
    });
    const onRemove = jest.fn();
    const stop = subscribeLive('a_b', null, { onUpsert: jest.fn(), onRemove });
    expect(onRemove).toHaveBeenCalledWith('m1');
    stop();
    expect(unsubRemoved).toHaveBeenCalled();
  });
});

describe('register race (Important 3)', () => {
  test('auth listeners see the new user only after the profile is saved', async () => {
    const cb = jest.fn();
    subscribeAuth(cb);
    const p = register('An', 'a@b.com', '123456');
    await Promise.resolve();
    await Promise.resolve();
    expect(cb).not.toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));
    mockResolveSet();
    await p;
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ uid: 'u1' }));
  });
});

describe('approximate location (Important 4)', () => {
  test('granting only coarse location counts as allowed', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: PermissionsAndroid.RESULTS.DENIED,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
    } as any);
    await expect(requestLocationPermission()).resolves.toBe(true);
  });
});
