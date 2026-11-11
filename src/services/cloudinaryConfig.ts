// Cloudinary: chỉ dùng UNSIGNED upload preset. KHÔNG đưa API secret vào mã nguồn.
// Lấy cloud name ở Dashboard; tạo preset ở Settings → Upload → Upload presets (Signing mode: Unsigned).
export const cloudinaryConfig = {
  cloudName: 'keqaa6qr',
  uploadPreset: 'chat_th06',
};

export const isCloudinaryConfigured = () =>
  !cloudinaryConfig.cloudName.startsWith('YOUR_') && !cloudinaryConfig.uploadPreset.startsWith('YOUR_');
