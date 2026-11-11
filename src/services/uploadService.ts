import { PermissionsAndroid, Platform } from 'react-native';
import { Asset, launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { cloudinaryConfig, isCloudinaryConfigured } from './cloudinaryConfig';

// Cạnh dài tối đa của ảnh trước khi tải lên
export const MAX_IMAGE_SIZE = 1024;

export type PickedImage = { uri: string; type: string; fileName: string; width?: number; height?: number };
export type ImageSource = 'camera' | 'library';

export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Quyền sử dụng camera',
    message: 'Ứng dụng cần camera để chụp ảnh gửi trong cuộc trò chuyện.',
    buttonPositive: 'Cho phép',
    buttonNegative: 'Từ chối',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function toPicked(asset: Asset | undefined): PickedImage | null {
  if (!asset?.uri) {
    return null;
  }
  return {
    uri: asset.uri,
    type: asset.type ?? 'image/jpeg',
    fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
    width: asset.width,
    height: asset.height,
  };
}

// Chụp hoặc chọn ảnh. maxWidth/maxHeight = 1024 nên ảnh đã được thu nhỏ (giữ tỉ lệ) trước khi tải lên.
// Trả về null nếu người dùng hủy; ném 'CAMERA_DENIED' nếu bị từ chối quyền.
export async function pickImage(source: ImageSource): Promise<PickedImage | null> {
  const options = {
    mediaType: 'photo' as const,
    maxWidth: MAX_IMAGE_SIZE,
    maxHeight: MAX_IMAGE_SIZE,
    quality: 0.8 as const,
  };
  if (source === 'camera') {
    if (!(await requestCameraPermission())) {
      throw new Error('CAMERA_DENIED');
    }
    const res = await launchCamera({ ...options, saveToPhotos: false });
    if (res.errorCode === 'permission') {
      throw new Error('CAMERA_DENIED');
    }
    if (res.errorCode) {
      throw new Error(res.errorCode);
    }
    return res.didCancel ? null : toPicked(res.assets?.[0]);
  }
  const res = await launchImageLibrary({ ...options, selectionLimit: 1 });
  if (res.errorCode) {
    throw new Error(res.errorCode);
  }
  return res.didCancel ? null : toPicked(res.assets?.[0]);
}

export const uploadUrl = (cloudName: string) => `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

export type UploadTask = { promise: Promise<string>; cancel: () => void };

// Tải ảnh lên Cloudinary bằng unsigned preset, trả về secure_url (https://res.cloudinary.com/...).
// Dùng XMLHttpRequest để có tiến độ và hủy được.
export function uploadImage(image: PickedImage, onProgress?: (ratio: number) => void): UploadTask {
  if (!isCloudinaryConfigured()) {
    return { promise: Promise.reject(new Error('CLOUDINARY_NOT_CONFIGURED')), cancel: () => {} };
  }
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    const form = new FormData();
    form.append('file', { uri: image.uri, type: image.type, name: image.fileName } as any);
    form.append('upload_preset', cloudinaryConfig.uploadPreset);
    form.append('folder', 'chat-th06');

    xhr.open('POST', uploadUrl(cloudinaryConfig.cloudName));
    xhr.timeout = 60000;
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && e.total > 0) {
        onProgress?.(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && typeof body.secure_url === 'string') {
          resolve(body.secure_url);
        } else {
          reject(new Error(body?.error?.message ?? `HTTP_${xhr.status}`));
        }
      } catch {
        reject(new Error(`HTTP_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('NETWORK'));
    xhr.ontimeout = () => reject(new Error('TIMEOUT'));
    xhr.onabort = () => reject(new Error('CANCELLED'));
    xhr.send(form);
  });
  return { promise, cancel: () => xhr.abort() };
}

// Ảnh thu nhỏ để hiển thị trong bong bóng (Cloudinary biến đổi ảnh qua URL)
export function thumbnailUrl(url: string, width = 600): string {
  return url.includes('/image/upload/') ? url.replace('/image/upload/', `/image/upload/c_limit,w_${width},q_auto/`) : url;
}
