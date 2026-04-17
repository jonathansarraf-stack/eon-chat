import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { ActivityEntry } from '../types';

interface Props {
  entries: ActivityEntry[];
}

export default function ActivityLog({ entries }: Props) {
  const [open, setOpen] = useState(false);
  const doneCount = entries.filter(e => e.done).length;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <Text style={[styles.arrow, open && styles.arrowOpen]}>▶</Text>
        {!entries.every(e => e.done) && <View style={styles.spinner} />}
        <Text style={styles.label}>
          {doneCount}/{entries.length} ferramentas
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.entries}>
          {entries.map((e, i) => (
            <Text key={i} style={[styles.entry, e.done && styles.entryDone]}>
              {e.icon} {e.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    marginHorizontal: 18,
    marginVertical: 2,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    paddingHorizontal: 10,
  },
  arrow: {
    fontSize: 8,
    color: colors.accent,
    fontFamily: 'monospace',
  },
  arrowOpen: {
    // rotated via text transform not available, use different char
  },
  spinner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.accent,
    borderTopColor: 'transparent',
  },
  label: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.accent,
  },
  entries: {
    paddingLeft: 24,
    paddingTop: 4,
    maxHeight: 300,
  },
  entry: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.text3,
    paddingVertical: 1,
  },
  entryDone: {
    opacity: 0.5,
  },
});
