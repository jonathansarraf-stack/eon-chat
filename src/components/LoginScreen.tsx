import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../theme';

interface Props {
  onLogin: (email: string) => void;
}

function EonLogo() {
  return (
    <View style={styles.logoWrap}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>E</Text>
        <View style={styles.logoDot} />
      </View>
    </View>
  );
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos');
      return;
    }
    setLoading(true);
    setError('');
    // Simulate login
    setTimeout(() => {
      setLoading(false);
      onLogin(email.trim());
    }, 800);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <EonLogo />

        <Text style={styles.kicker}>CLAUDE MOBILE</Text>
        <Text style={styles.heading}>
          Seu chat, <Text style={styles.headingItalic}>do bolso.</Text>
        </Text>
        <Text style={styles.subtitle}>
          Converse com Claude direto do celular. Sessões persistentes, voz, arquivos.
        </Text>

        <View style={styles.form}>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Email"
            placeholderTextColor={colors.text3}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Senha"
            placeholderTextColor={colors.text3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View style={styles.errorWrap}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'ENTRANDO...' : 'ENTRAR'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 32,
  },

  logoWrap: { marginBottom: 24 },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  logoDot: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },

  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.text2,
    marginBottom: 12,
  },
  heading: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 38,
  },
  headingItalic: {
    fontStyle: 'italic',
    color: colors.accent,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 28,
  },

  form: {
    width: '100%',
    backgroundColor: colors.bg2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorWrap: {
    minHeight: 18,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
