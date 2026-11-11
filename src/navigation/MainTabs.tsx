import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HomeScreen from '../screens/HomeScreen';
import ContactsScreen from '../screens/ContactsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useChats } from '../context/ChatsContext';
import { colors } from '../theme';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, string> = {
  Home: 'chat',
  Contacts: 'account-multiple',
  Notifications: 'bell',
  Settings: 'cog',
};

const tabIcon =
  (name: string) =>
  ({ color, size }: { color: string; size: number }) =>
    <Icon name={name} color={color} size={size} />;

export default function MainTabs() {
  const { unread, unreadNotifications } = useChats();
  const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: tabIcon(ICONS[route.name]),
      })}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Tin nhắn',
          tabBarBadge: badge(unread),
          tabBarBadgeStyle: { backgroundColor: colors.badge },
        }}
      />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Danh bạ' }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Thông báo',
          tabBarBadge: badge(unreadNotifications),
          tabBarBadgeStyle: { backgroundColor: colors.badge },
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Cài đặt' }} />
    </Tab.Navigator>
  );
}
