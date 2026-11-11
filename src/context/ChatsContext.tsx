import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppUser, subscribeUsers } from '../services/userService';
import {
  Conversation,
  subscribeConversation,
  subscribeUserChats,
  totalUnread,
  UserChat,
} from '../services/chatService';
import { AppNotification, countUnread, subscribeNotifications } from '../services/notificationService';
import { useAuth } from './AuthContext';

type ChatsState = {
  users: Record<string, AppUser>;
  userList: AppUser[];
  chats: UserChat[];
  conversations: Record<string, Conversation>;
  unread: number;
  notifications: AppNotification[];
  unreadNotifications: number;
};

const ChatsContext = createContext<ChatsState>({
  users: {},
  userList: [],
  chats: [],
  conversations: {},
  unread: 0,
  notifications: [],
  unreadNotifications: 0,
});

export function ChatsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [userList, setUserList] = useState<AppUser[]>([]);
  const [chats, setChats] = useState<UserChat[]>([]);
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const convSubs = useRef(new Map<string, () => void>());

  useEffect(() => {
    setNotifications([]);
    if (!uid) {
      return;
    }
    return subscribeNotifications(uid, setNotifications);
  }, [uid]);

  useEffect(() => subscribeUsers(setUserList), []);

  useEffect(() => {
    setChats([]);
    if (!uid) {
      return;
    }
    return subscribeUserChats(uid, setChats);
  }, [uid]);

  // Luật bảo mật chỉ cho đọc từng conversations/{convId} mà mình là thành viên,
  // nên nghe riêng từng cuộc trò chuyện có trong userChats
  useEffect(() => {
    const subs = convSubs.current;
    const ids = new Set(chats.map(c => c.convId));
    for (const [id, off] of subs) {
      if (!ids.has(id)) {
        off();
        subs.delete(id);
        setConversations(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
    for (const id of ids) {
      if (!subs.has(id)) {
        subs.set(
          id,
          subscribeConversation(id, conv =>
            setConversations(prev => {
              const next = { ...prev };
              if (conv) {
                next[id] = conv;
              } else {
                delete next[id];
              }
              return next;
            }),
          ),
        );
      }
    }
  }, [chats]);

  // Đăng xuất hoặc unmount: hủy hết listener cuộc trò chuyện
  useEffect(() => {
    const subs = convSubs.current;
    return () => {
      subs.forEach(off => off());
      subs.clear();
      setConversations({});
    };
  }, [uid]);

  const value = useMemo(
    () => ({
      userList,
      users: Object.fromEntries(userList.map(u => [u.uid, u])),
      chats,
      conversations,
      unread: totalUnread(chats),
      notifications,
      unreadNotifications: countUnread(notifications),
    }),
    [userList, chats, conversations, notifications],
  );

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export const useChats = () => useContext(ChatsContext);
