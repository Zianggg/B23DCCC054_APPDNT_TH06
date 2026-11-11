export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined;
  // otherUid chỉ cần khi mở chat 1-1 chưa có tin nào (cuộc trò chuyện chưa được tạo)
  Chat: { convId: string; otherUid?: string };
  CreateGroup: undefined;
  GroupInfo: { convId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Contacts: undefined;
  Notifications: undefined;
  Settings: undefined;
};
