import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import PressableScale from '../components/PressableScale';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import ScreenHeader from '../components/ScreenHeader';
import ConversationItem from '../components/ConversationItem';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatsContext';
import { chatDisplay, previewWithSender } from '../utils/chatDisplay';
import { AppStackParamList, MainTabParamList } from '../navigation/types';
import { colors, font, radius, spacing } from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<AppStackParamList>
>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { chats, users, conversations, unread } = useChats();
  const myUid = useAuth().user?.uid ?? '';

  return (
    <View style={styles.safe}>
      <ScreenHeader
        title="Tin nhắn"
        subtitle={unread > 0 ? `${unread} tin nhắn chưa đọc` : 'Bạn đã đọc hết tin nhắn'}>
        <PressableScale
          style={styles.newGroup}
          onPress={() => navigation.navigate('CreateGroup')}
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel="Tạo nhóm">
          <Icon name="account-multiple-plus" size={20} color={colors.primary} />
          <Text style={styles.newGroupText}>Tạo nhóm</Text>
        </PressableScale>
      </ScreenHeader>
      <FlatList
        data={chats}
        keyExtractor={c => c.convId}
        renderItem={({ item }) => {
          const display = chatDisplay(conversations[item.convId], myUid, users);
          return (
            <ConversationItem
              chat={item}
              display={display}
              preview={previewWithSender(item.lastMessage, item.lastSenderId, myUid, display.isGroup, users)}
              onPress={() =>
                navigation.navigate('Chat', { convId: item.convId, otherUid: display.otherUid })
              }
            />
          );
        }}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="chat-outline"
            title="Chưa có cuộc trò chuyện nào"
            actionLabel="Mở danh bạ"
            onAction={() => navigation.navigate('Contacts')}
          />
        }
      />
    </View>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  sep: { height: spacing.sm },
  newGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  newGroupText: { color: colors.primary, fontWeight: '800', fontSize: font.body },
});
