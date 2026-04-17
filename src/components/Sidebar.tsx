import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { colors } from '../theme';
import { Session } from '../types';

interface Props {
  sessions: Session[];
  activeSessionId: string | null;
  userEmail: string;
  visible: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
  onLogout: () => void;
}

function formatMeta(ts: number, count: number) {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} · ${count} msgs`;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  userEmail,
  visible,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onClose,
  onLogout,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={styles.sidebar}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.newBtn} onPress={onNewSession} activeOpacity={0.8}>
            <Text style={styles.newBtnText}>＋ NOVA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Session List */}
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {sessions.map(s => {
            const isActive = s.id === activeSessionId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.sessionItem, isActive && styles.sessionActive]}
                onPress={() => {
                  onSelectSession(s.id);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionTitle} numberOfLines={1}>{s.title}</Text>
                  <TouchableOpacity
                    onPress={() => onDeleteSession(s.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sessionSnippet} numberOfLines={1}>{s.snippet}</Text>
                <Text style={styles.sessionMeta}>{formatMeta(s.updated, s.messageCount)}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerEmail} numberOfLines={1}>{userEmail}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sidebar: {
    width: Math.min(Dimensions.get('window').width * 0.85, 320),
    backgroundColor: colors.bg2,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: '100%',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  newBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  newBtnText: {
    color: colors.bg,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: colors.text2, fontSize: 14 },

  list: {
    flex: 1,
    padding: 10,
  },
  sessionItem: {
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  sessionActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(197,255,61,0.2)',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  deleteBtn: {
    color: colors.text3,
    fontSize: 12,
  },
  sessionSnippet: {
    fontSize: 11,
    color: colors.text2,
    lineHeight: 16,
    marginTop: 2,
  },
  sessionMeta: {
    fontSize: 9,
    color: colors.text3,
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  footerEmail: {
    fontSize: 10,
    color: colors.text2,
    flex: 1,
    marginRight: 12,
    fontFamily: 'monospace',
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  logoutText: { fontSize: 10, color: colors.text2 },
});
