import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface Props {
  title: string;
  userEmail: string;
  onMenuPress: () => void;
  onRename: (title: string) => void;
}

export default function Topbar({ title, userEmail, onMenuPress, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  const handleBlur = () => {
    setEditing(false);
    if (editTitle.trim() && editTitle !== title) {
      onRename(editTitle.trim());
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.menuBtn} onPress={onMenuPress} activeOpacity={0.7}>
        <Text style={styles.menuIcon}>☰</Text>
      </TouchableOpacity>

      <TextInput
        style={[styles.titleInput, editing && styles.titleInputEditing]}
        value={editing ? editTitle : title}
        onChangeText={setEditTitle}
        onFocus={() => { setEditing(true); setEditTitle(title); }}
        onBlur={handleBlur}
        onSubmitEditing={handleBlur}
        placeholder="Nova conversa"
        placeholderTextColor={colors.text3}
        numberOfLines={1}
      />

      <TouchableOpacity style={styles.userBtn} activeOpacity={0.7}>
        <Text style={styles.userText}>{userEmail.split('@')[0]}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 52,
    paddingBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: colors.bg2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 16,
    color: colors.text2,
  },
  titleInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  titleInputEditing: {
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
  },
  userBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
  },
  userText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.text2,
  },
});
