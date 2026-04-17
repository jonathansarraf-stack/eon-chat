import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Topbar from './src/components/Topbar';
import Sidebar from './src/components/Sidebar';
import SessionTabs from './src/components/SessionTabs';
import EmptyHero from './src/components/EmptyHero';
import MessageBubble from './src/components/MessageBubble';
import TypingIndicator from './src/components/TypingIndicator';
import ActivityLog from './src/components/ActivityLog';
import Composer from './src/components/Composer';
import { colors } from './src/theme';
import { Session, Message, ActivityEntry } from './src/types';
import * as api from './src/api';

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [serverOnline, setServerOnline] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [notAuthenticated, setNotAuthenticated] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Check server health and auth on mount
  useEffect(() => {
    api.checkHealth().then(online => {
      setServerOnline(online);
      if (online) {
        api.checkAuth().then(auth => {
          setAuthChecked(true);
          if (auth.loggedIn) {
            setUserEmail(auth.email || 'local');
          } else {
            setNotAuthenticated(true);
          }
        }).catch(() => setAuthChecked(true));
      }
    });
  }, []);

  // Load sessions on mount
  useEffect(() => {
    if (!serverOnline || !authChecked || notAuthenticated) return;
    api.fetchSessions().then((data) => {
      const mapped: Session[] = data.map(s => ({
        id: s.id,
        title: s.title,
        snippet: s.snippet || '',
        created: s.created,
        updated: s.updated,
        messageCount: s.messageCount,
      }));
      setSessions(mapped);
      setOpenSessionIds(mapped.slice(0, 5).map(s => s.id));
    }).catch(() => setServerOnline(false));
  }, [serverOnline, authChecked, notAuthenticated]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, [messages.length, typing, streamingText]);

  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    setOpenSessionIds(prev => prev.includes(id) ? prev : [...prev, id]);
    try {
      const data = await api.fetchMessages(id);
      const mapped: Message[] = data.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        ts: m.ts,
        durationMs: m.durationMs,
        costUsd: m.costUsd,
        isError: !!m.isError,
      }));
      setMessages(mapped);
    } catch {
      setMessages([]);
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    try {
      const data = await api.createSession();
      const newSession: Session = {
        id: data.id,
        title: data.title,
        snippet: '',
        created: data.created,
        updated: data.updated,
        messageCount: 0,
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
      setOpenSessionIds(prev => [data.id, ...prev]);
      setSidebarVisible(false);
    } catch (e) {
      console.error('Failed to create session', e);
    }
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      setOpenSessionIds(prev => prev.filter(x => x !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  }, [activeSessionId]);

  const handleCloseTab = useCallback((id: string) => {
    setOpenSessionIds(prev => {
      const next = prev.filter(x => x !== id);
      if (activeSessionId === id) {
        const idx = prev.indexOf(id);
        const fallback = prev[idx + 1] || prev[idx - 1] || null;
        if (fallback) {
          setActiveSessionId(fallback);
          api.fetchMessages(fallback).then(data => {
            setMessages(data.map(m => ({
              id: m.id, role: m.role, text: m.text, ts: m.ts,
              durationMs: m.durationMs, costUsd: m.costUsd, isError: !!m.isError,
            })));
          }).catch(() => setMessages([]));
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
      return next;
    });
  }, [activeSessionId]);

  const handleRename = useCallback(async (title: string) => {
    if (!activeSessionId) return;
    try {
      await api.renameSession(activeSessionId, title);
      setSessions(prev =>
        prev.map(s => s.id === activeSessionId ? { ...s, title } : s)
      );
    } catch (e) {
      console.error('Failed to rename session', e);
    }
  }, [activeSessionId]);

  const handleSend = useCallback((text: string) => {
    if (!activeSessionId) return;

    // Optimistic user message
    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      text,
      ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    setTyping(true);
    setStreamingText('');
    setActivities([]);

    setSessions(prev =>
      prev.map(s =>
        s.id === activeSessionId
          ? { ...s, snippet: text, updated: Date.now(), messageCount: s.messageCount + 1 }
          : s
      )
    );

    const controller = api.sendMessage(activeSessionId, text, {
      onTextDelta: (delta) => {
        setStreamingText(prev => prev + delta);
      },
      onActivity: (activity) => {
        setActivities(prev => {
          // Update existing or add new
          const existing = prev.findIndex(a => a.tool === activity.tool && !a.done);
          if (activity.done && existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], done: true };
            return updated;
          }
          return [...prev, activity];
        });
      },
      onDone: (msg) => {
        setTyping(false);
        setSending(false);
        setStreamingText('');
        setMessages(prev => [
          ...prev,
          {
            id: msg.id,
            role: 'assistant',
            text: msg.text,
            ts: msg.ts,
            durationMs: msg.durationMs,
            costUsd: msg.costUsd,
          },
        ]);
        setSessions(prev =>
          prev.map(s =>
            s.id === activeSessionId
              ? { ...s, snippet: msg.text.slice(0, 80), updated: Date.now(), messageCount: s.messageCount + 1 }
              : s
          )
        );
      },
      onTitleUpdate: (title) => {
        setSessions(prev =>
          prev.map(s => s.id === activeSessionId ? { ...s, title } : s)
        );
      },
      onError: (error) => {
        setTyping(false);
        setSending(false);
        setStreamingText('');
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            text: `Erro: ${error}`,
            ts: Date.now(),
            isError: true,
          },
        ]);
      },
    });

    abortRef.current = controller;
  }, [activeSessionId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setTyping(false);
    setSending(false);
    setStreamingText('');
  }, []);

  // Show not authenticated screen
  if (serverOnline && authChecked && notAuthenticated) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.offlineContainer}>
          <View style={[styles.offlineBadge, { borderColor: 'rgba(255,200,0,0.3)', backgroundColor: 'rgba(255,200,0,0.08)' }]}>
            <Text style={[styles.offlineDot, { color: '#ffc800' }]}>●</Text>
            <Text style={[styles.offlineText, { color: '#ffc800' }]}>Não autenticado</Text>
          </View>
          <Text style={styles.offlineTitle}>Claude Login</Text>
          <Text style={styles.offlineBody}>
            Faça login no Claude Code para usar o Eon Chat:{'\n\n'}
            <Text style={styles.offlineCode}>claude login</Text>
          </Text>
          <Text
            style={styles.offlineRetry}
            onPress={() => {
              api.checkAuth().then(auth => {
                if (auth.loggedIn) {
                  setNotAuthenticated(false);
                  setUserEmail(auth.email || 'local');
                }
              });
            }}
          >
            Verificar novamente
          </Text>
        </View>
      </View>
    );
  }

  // Show offline banner
  if (!serverOnline) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.offlineContainer}>
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineDot}>●</Text>
            <Text style={styles.offlineText}>Servidor offline</Text>
          </View>
          <Text style={styles.offlineTitle}>Eon Chat Server</Text>
          <Text style={styles.offlineBody}>
            Inicie o servidor local para conectar:{'\n\n'}
            <Text style={styles.offlineCode}>cd server && npm start</Text>
          </Text>
          <Text
            style={styles.offlineRetry}
            onPress={() => api.checkHealth().then(setServerOnline)}
          >
            Tentar novamente
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Topbar
          title={activeSession?.title || 'Nova conversa'}
          userEmail={userEmail}
          onMenuPress={() => setSidebarVisible(true)}
          onRename={handleRename}
        />

        <SessionTabs
          sessions={sessions}
          openSessionIds={openSessionIds}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onCloseTab={handleCloseTab}
        />

        {!activeSessionId ? (
          <EmptyHero />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Activity log during streaming */}
            {activities.length > 0 && (
              <ActivityLog entries={activities} />
            )}

            {/* Streaming text (partial assistant response) */}
            {typing && streamingText ? (
              <MessageBubble
                message={{
                  id: -1,
                  role: 'assistant',
                  text: streamingText,
                  ts: Date.now(),
                }}
              />
            ) : null}

            {typing && !streamingText && <TypingIndicator />}
            <View style={{ height: 20 }} />
          </ScrollView>
        )}

        {activeSessionId && (
          <Composer onSend={handleSend} isSending={sending} onStop={handleStop} />
        )}

        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          userEmail={userEmail}
          visible={sidebarVisible}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onClose={() => setSidebarVisible(false)}
          onLogout={() => {}}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 20,
    gap: 0,
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,94,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,94,94,0.2)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  offlineDot: {
    color: '#ff5e5e',
    fontSize: 8,
  },
  offlineText: {
    color: '#ff5e5e',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  offlineTitle: {
    fontSize: 22,
    fontWeight: '300',
    color: colors.text,
    marginBottom: 12,
  },
  offlineBody: {
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 22,
  },
  offlineCode: {
    fontFamily: 'monospace',
    color: colors.accent,
    fontSize: 13,
  },
  offlineRetry: {
    marginTop: 24,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
