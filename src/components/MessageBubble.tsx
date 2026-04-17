import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Message } from '../types';

interface Props {
  message: Message;
}

function renderText(text: string, isUser: boolean) {
  // Simple markdown: **bold**, `code`, ```pre```
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Handle code blocks first
  const codeBlockRegex = /```(?:\w*\n)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  const segments: { type: 'text' | 'codeblock'; content: string }[] = [];

  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: remaining.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'codeblock', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    segments.push({ type: 'text', content: remaining.slice(lastIndex) });
  }

  return segments.map((seg, i) => {
    if (seg.type === 'codeblock') {
      return (
        <View key={i} style={styles.codeBlock}>
          <Text style={styles.codeBlockText}>{seg.content}</Text>
        </View>
      );
    }

    // Process inline markdown
    const inlineParts: React.ReactNode[] = [];
    const inlineRegex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
    let inlineLastIndex = 0;
    let inlineMatch;
    let inlineKey = 0;

    while ((inlineMatch = inlineRegex.exec(seg.content)) !== null) {
      if (inlineMatch.index > inlineLastIndex) {
        inlineParts.push(
          <Text key={`t${i}-${inlineKey++}`} style={isUser ? styles.textUser : styles.textAssistant}>
            {seg.content.slice(inlineLastIndex, inlineMatch.index)}
          </Text>
        );
      }
      if (inlineMatch[2]) {
        // Bold
        inlineParts.push(
          <Text key={`b${i}-${inlineKey++}`} style={[isUser ? styles.textUser : styles.textAssistant, { fontWeight: '700' }]}>
            {inlineMatch[2]}
          </Text>
        );
      } else if (inlineMatch[3]) {
        // Inline code
        inlineParts.push(
          <Text key={`c${i}-${inlineKey++}`} style={[styles.inlineCode, isUser && styles.inlineCodeUser]}>
            {inlineMatch[3]}
          </Text>
        );
      }
      inlineLastIndex = inlineMatch.index + inlineMatch[0].length;
    }

    if (inlineLastIndex < seg.content.length) {
      inlineParts.push(
        <Text key={`e${i}-${inlineKey++}`} style={isUser ? styles.textUser : styles.textAssistant}>
          {seg.content.slice(inlineLastIndex)}
        </Text>
      );
    }

    return <Text key={i}>{inlineParts}</Text>;
  });
}

function formatMeta(msg: Message) {
  const parts: string[] = [];
  if (msg.durationMs) {
    parts.push(`${(msg.durationMs / 1000).toFixed(1)}s`);
  }
  if (msg.costUsd) {
    parts.push(`$${msg.costUsd.toFixed(4)}`);
  }
  return parts.join(' · ');
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const meta = !isUser ? formatMeta(message) : '';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleAssistant,
        message.isError && styles.bubbleError,
      ]}>
        {renderText(message.text, isUser)}
        {meta ? (
          <Text style={styles.meta}>{meta}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 6,
    paddingHorizontal: 18,
  },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },

  bubble: {
    maxWidth: '88%',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleError: {
    borderColor: colors.danger,
  },

  textUser: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.bg,
    fontWeight: '500',
  },
  textAssistant: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },

  inlineCode: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 5,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.text,
  },
  inlineCodeUser: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    color: colors.bg,
  },

  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
  },
  codeBlockText: {
    fontSize: 12.5,
    fontFamily: 'monospace',
    color: colors.text,
    lineHeight: 18,
  },

  meta: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.text3,
    marginTop: 6,
  },
});
