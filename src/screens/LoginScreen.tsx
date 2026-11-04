import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACCOUNTS } from '../auth/accounts';
import { useAuth } from '../auth/AuthProvider';
import { Ionicons } from '../theme/Ionicons';
import { shadow } from '../theme/shadows';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing, TOUCH_TARGET } from '../theme/tokens';
import * as Haptics from '../utils/haptics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Full-screen gate shown until there is a session. With `VITE_ACCOUNTS` set
 * the e-mail is picked by tapping a name and only the password is typed;
 * without it a plain e-mail field appears.
 */
export function LoginScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [email, setEmail] = useState(ACCOUNTS.length === 1 ? ACCOUNTS[0].email : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length > 0 && !busy;

  const submit = useCallback(async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setError(ACCOUNTS.length > 0 ? 'Elige quién eres.' : 'Escribe un correo válido.');
      return;
    }
    if (!password) {
      setError('Escribe tu contraseña.');
      return;
    }
    void Haptics.selectionAsync();
    setBusy(true);
    setError(null);
    const result = await auth.signIn(email, password);
    setBusy(false);
    if (result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.error);
    }
  }, [auth, email, password]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="today-outline" size={30} color={colors.onPrimary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>day2day</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Entra una vez en este dispositivo y tu día queda sincronizado.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            shadow('sm', isDark),
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {ACCOUNTS.length > 0 ? (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>¿Quién eres?</Text>
              <View style={styles.row}>
                {ACCOUNTS.map((account) => {
                  const selected = account.email === email;
                  return (
                    <Pressable
                      key={account.email}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setEmail(account.email);
                        setError(null);
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Entrar como ${account.name}`}
                      style={({ pressed }) => [
                        styles.person,
                        {
                          backgroundColor: selected ? colors.primary : colors.muted,
                          borderColor: selected ? colors.primary : colors.border,
                          opacity: busy ? 0.5 : pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={selected ? 'person-circle' : 'person-circle-outline'}
                        size={22}
                        color={selected ? colors.onPrimary : colors.foreground}
                      />
                      <Text
                        style={[
                          styles.personText,
                          { color: selected ? colors.onPrimary : colors.foreground },
                        ]}
                      >
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Correo</Text>
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setError(null);
                }}
                editable={!busy}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                accessibilityLabel="Correo"
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
                ]}
              />
            </>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground, marginTop: spacing.sm }]}>
            Contraseña
          </Text>
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              editable={!busy}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              accessibilityLabel="Contraseña"
              style={[
                styles.input,
                styles.passwordInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
              ]}
            />
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              hitSlop={8}
              style={styles.eye}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>

          {error ? (
            <View style={[styles.feedback, { borderColor: colors.destructive }]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={[styles.feedbackText, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void submit()}
            disabled={!canSubmit}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="log-in-outline" size={18} color={colors.onPrimary} />
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Lo que ya tenías guardado en este dispositivo se sube a tu cuenta al entrar.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.headline },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  label: { fontFamily: fontFamily.semibold, fontSize: fontSize.caption },
  row: { flexDirection: 'row', gap: spacing.sm },
  person: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  personText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
  },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: TOUCH_TARGET },
  eye: {
    position: 'absolute',
    right: 0,
    width: TOUCH_TARGET,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedback: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  feedbackText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 18 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  primaryBtnText: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
  footer: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: 18,
    textAlign: 'center',
  },
});
