import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors } from '../theme';

interface Attachment {
  name: string;
  type: string;
}

interface Props {
  onSend: (text: string) => void;
  isSending: boolean;
  onStop?: () => void;
}

export default function Composer({ onSend, isSending, onStop }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    if (isSending && onStop) {
      onStop();
      return;
    }
    if (!text.trim() && attachments.length === 0) return;
    onSend(text.trim());
    setText('');
    setAttachments([]);
  };

  const handleAttach = () => {
    // Simulate adding attachment
    setAttachments(prev => [
      ...prev,
      { name: `arquivo_${prev.length + 1}.txt`, type: 'text' },
    ]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const toggleVoice = () => {
    setRecording(!recording);
    // In real app, would use expo-speech or Web Speech API
  };

  return (
    <View style={styles.container}>
      <View style={[styles.wrap, isSending && styles.wrapSending]}>
        {/* Attachments */}
        {attachments.length > 0 && (
          <View style={styles.attachments}>
            {attachments.map((a, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipName} numberOfLines={1}>{a.name}</Text>
                <TouchableOpacity onPress={() => removeAttachment(i)}>
                  <Text style={styles.chipDelete}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Input */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Mensagem..."
          placeholderTextColor={colors.text3}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          editable={!isSending}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {/* Tools */}
        <View style={styles.tools}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleAttach} activeOpacity={0.7}>
            <Text style={styles.toolIcon}>📎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, recording && styles.toolBtnRecording]}
            onPress={toggleVoice}
            activeOpacity={0.7}
          >
            <Text style={styles.toolIcon}>{recording ? '⏹' : '🎙️'}</Text>
          </TouchableOpacity>

          {/* Send / Stop */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              isSending && styles.sendBtnStop,
              !text.trim() && !isSending && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            activeOpacity={0.7}
            disabled={!text.trim() && !isSending}
          >
            <Text style={[styles.sendIcon, isSending && styles.sendIconStop]}>
              {isSending ? '■' : '➤'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 14,
  },
  wrap: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  wrapSending: {
    borderColor: colors.accentBorder,
  },

  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(197,255,61,0.25)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chipName: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.accent,
    maxWidth: 140,
  },
  chipDelete: {
    fontSize: 12,
    color: colors.accent,
    opacity: 0.7,
  },

  input: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    minHeight: 24,
    maxHeight: 140,
    paddingVertical: 4,
  },

  tools: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  toolBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnRecording: {
    backgroundColor: 'rgba(255,94,94,0.15)',
  },
  toolIcon: { fontSize: 18 },

  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnStop: {
    backgroundColor: colors.danger,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendIcon: {
    fontSize: 18,
    color: colors.bg,
    fontWeight: '700',
  },
  sendIconStop: {
    fontSize: 14,
    color: '#fff',
  },
});
