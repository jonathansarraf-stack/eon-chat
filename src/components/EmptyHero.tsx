import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function EmptyHero() {
  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>E</Text>
        <View style={styles.logoDot} />
      </View>
      <Text style={styles.heading}>
        Como posso{'\n'}
        <Text style={styles.headingAccent}>ajudar?</Text>
      </Text>
      <Text style={styles.body}>
        Converse com Claude direto da sua máquina. Sessões persistentes, streaming em tempo real.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    maxWidth: 420,
    alignSelf: 'center',
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accent,
  },
  logoDot: {
    position: 'absolute',
    top: 12,
    right: 14,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  heading: {
    fontSize: 24,
    fontWeight: '300',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 12,
  },
  headingAccent: {
    fontStyle: 'italic',
    color: colors.accent,
  },
  body: {
    fontSize: 13,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
  },
});
