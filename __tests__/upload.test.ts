jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('../src/services/firebase', () => ({ auth: {}, db: {} }));
// Giả lập chưa điền cấu hình để kiểm tra nhánh báo lỗi
jest.mock('../src/services/cloudinaryConfig', () => ({
  cloudinaryConfig: { cloudName: 'YOUR_CLOUD_NAME', uploadPreset: 'YOUR_UNSIGNED_PRESET' },
  isCloudinaryConfigured: () => false,
}));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db: unknown, path?: string) => ({ path })),
  push: jest.fn(() => ({ key: 'K' })),
  update: jest.fn(() => Promise.resolve()),
  increment: jest.fn((n: number) => ({ inc: n })),
  serverTimestamp: jest.fn(() => 'TS'),
  onValue: jest.fn(),
  onDisconnect: jest.fn(),
}));

import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { update } from 'firebase/database';
import { pickImage, thumbnailUrl, uploadImage, uploadUrl } from '../src/services/uploadService';
import { bubbleSize } from '../src/components/ImageBubbles';
import { sendImage } from '../src/services/chatService';

describe('image helpers', () => {
  test('upload endpoint uses the cloud name only (no secret)', () => {
    expect(uploadUrl('demo')).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
  });

  test('thumbnail inserts a Cloudinary transformation', () => {
    expect(thumbnailUrl('https://res.cloudinary.com/d/image/upload/v1/a.jpg')).toBe(
      'https://res.cloudinary.com/d/image/upload/c_limit,w_600,q_auto/v1/a.jpg',
    );
  });

  test('bubble keeps aspect ratio inside 240x320', () => {
    expect(bubbleSize(1024, 768)).toEqual({ width: 240, height: 180 });
    expect(bubbleSize(768, 1024)).toEqual({ width: 240, height: 320 });
    expect(bubbleSize()).toEqual({ width: 240, height: 240 });
  });

  test('upload rejects when Cloudinary is not configured', async () => {
    await expect(uploadImage({ uri: 'file://a.jpg', type: 'image/jpeg', fileName: 'a.jpg' }).promise).rejects.toThrow(
      'CLOUDINARY_NOT_CONFIGURED',
    );
  });
});

describe('pickImage', () => {
  test('denied camera permission throws CAMERA_DENIED and never opens the camera', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    await expect(pickImage('camera')).rejects.toThrow('CAMERA_DENIED');
    expect(launchCamera).not.toHaveBeenCalled();
  });

  test('camera is opened with max 1024px on the long side', async () => {
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    (launchCamera as jest.Mock).mockResolvedValue({ assets: [{ uri: 'file://x.jpg', width: 1024, height: 768 }] });
    const img = await pickImage('camera');
    expect((launchCamera as jest.Mock).mock.calls[0][0]).toMatchObject({ maxWidth: 1024, maxHeight: 1024 });
    expect(img).toMatchObject({ uri: 'file://x.jpg', width: 1024, height: 768 });
  });
});

describe('sendImage', () => {
  test('stores only the image URL (+ size) and previews as 📷 Hình ảnh', async () => {
    const conv = { id: 'g1', type: 'group' as const, members: { a: true as const, b: true as const }, exists: true };
    await sendImage('a', conv, 'https://res.cloudinary.com/d/image/upload/v1/a.jpg', { width: 800, height: 600 });
    const u = (update as jest.Mock).mock.calls[0][1];
    expect(u['messages/g1/K']).toEqual({
      senderId: 'a',
      type: 'image',
      imageUrl: 'https://res.cloudinary.com/d/image/upload/v1/a.jpg',
      width: 800,
      height: 600,
      createdAt: 'TS',
    });
    expect(u['userChats/b/g1/lastMessage']).toBe('📷 Hình ảnh');
  });
});
