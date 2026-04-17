import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme';
import { Session } from '../types';

interface Props {
  sessions: Session[];
  openSessionIds: string[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export default function SessionTabs({
  sessions,
  openSessionIds,
  activeSessionId,
  onSelectSession,
  onCloseTab,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  if (openSessionIds.length === 0) return null;

  const openSessions = openSessionIds
    .map(id => sessions.find(s => s.id === id))
    .filter(Boolean) as Session[];

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {openSessions.map(s => {
          const isActive = s.id === activeSessionId;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onSelectSession(s.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.tabText, isActive && styles.tabTextActive]}
                numberOfLines={1}
              >
                {s.title}
              </Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  onCloseTab(s.id);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.closeBtn}
              >
                <Text style={[styles.closeText, isActive && styles.closeTextActive]}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 180,
  },
  tabActive: {
    backgroundColor: colors.surface2,
    borderColor: colors.accentBorder,
  },
  tabText: {
    fontSize: 11,
    color: colors.text2,
    fontWeight: '500',
    marginRight: 6,
    flexShrink: 1,
  },
  tabTextActive: {
    color: colors.text,
  },
  closeBtn: {
    width: 18,
    height: 18,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 9,
    color: colors.text3,
  },
  closeTextActive: {
    color: colors.text2,
  },
});
