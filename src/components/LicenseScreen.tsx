import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { colors } from '../theme';

interface LicenseStatus {
  status: string;
  email?: string;
  plan?: string;
  trialEnd?: number;
}

interface Props {
  apiBase: string;
  onActivated: () => void;
}

export default function LicenseScreen({ apiBase, onActivated }: Props) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${apiBase}/api/license/status`)
      .then(r => r.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleActivate = async () => {
    if (!key.trim()) {
      setError('Cole sua license key');
      return;
    }
    setActivating(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = await res.json();

      if (data.ok) {
        onActivated();
      } else {
        setError(data.error || 'Key invalida');
      }
    } catch (e: any) {
      setError(e.message || 'Erro de conexao');
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Verificando licenca...</Text>
      </View>
    );
  }

  const isExpired = status?.status === 'expired';
  const isTrial = status?.status === 'trial';
  const trialDays = isTrial && status?.trialEnd
    ? Math.max(0, Math.ceil((status.trialEnd - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>E</Text>
        </View>

        <Text style={styles.title}>
          {isExpired ? 'Licenca expirada' : 'Ativar Eon Chat'}
        </Text>

        {isTrial && trialDays > 0 && (
          <View style={styles.trialBadge}>
            <Text style={styles.trialText}>
              Trial: {trialDays} {trialDays === 1 ? 'dia' : 'dias'} restantes
            </Text>
          </View>
        )}

        {isExpired && (
          <Text style={styles.expiredText}>
            Seu periodo de teste acabou. Assine para continuar usando.
          </Text>
        )}

        <View style={styles.form}>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="eon_xxxxxxxxxxxxxxxx..."
            placeholderTextColor={colors.text3}
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, activating && styles.btnDisabled]}
            onPress={handleActivate}
            disabled={activating}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>
              {activating ? 'ATIVANDO...' : 'ATIVAR LICENSE KEY'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => Linking.openURL('https://eon.chat/#pricing')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnSecondaryText}>ASSINAR — $9/mes</Text>
          </TouchableOpacity>

          {isTrial && trialDays > 0 && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={onActivated}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Continuar com trial</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
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
  loading: {
    color: colors.text2,
    fontSize: 14,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 32,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
  },
  title: {
    fontSize: 24,
    fontWeight: '300',
    color: colors.text,
    marginBottom: 16,
  },
  trialBadge: {
    backgroundColor: 'rgba(255,200,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,200,0,0.2)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  trialText: {
    color: '#ffc800',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  expiredText: {
    color: colors.text2,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
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
    fontSize: 13,
    fontFamily: 'monospace',
    color: colors.accent,
  },
  inputError: {
    borderColor: '#ff5e5e',
  },
  error: {
    fontSize: 12,
    color: '#ff5e5e',
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 11,
    color: colors.text3,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    color: colors.text3,
    fontSize: 12,
  },
});
