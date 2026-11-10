import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { signedMealPhotoUrl } from '../../lib/nutrition/photos';
import { useTheme } from '../../theme/ThemeProvider';
import { radius } from '../../theme/tokens';

/** Signed URL for a stored meal photo; null while loading, offline or when the file is gone. */
export function useMealPhotoUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void signedMealPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

type ThumbProps = {
  path: string | null;
  size: number;
  /** Shown while the photo is not available. */
  fallback: React.ReactNode;
};

/** Square thumbnail of the meal photo, or the fallback when there is none. */
export function MealThumb({ path, size, fallback }: ThumbProps) {
  const url = useMealPhotoUrl(path);
  if (!url) return <>{fallback}</>;
  return (
    <Image
      source={{ uri: url }}
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: radius.md }}
      resizeMode="cover"
    />
  );
}

type PhotoProps = {
  /** Local preview (object URL) wins over the stored copy. */
  uri?: string | null;
  path?: string | null;
};

/** The meal photo at full card width; renders nothing when there is no photo at all. */
export function MealPhoto({ uri = null, path = null }: PhotoProps) {
  const { colors } = useTheme();
  const stored = useMealPhotoUrl(uri ? null : path);
  const src = uri ?? stored;
  if (!src) {
    if (!path) return null;
    return <View style={[styles.photo, { backgroundColor: colors.muted }]} />;
  }
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel="Foto de la comida"
      accessibilityIgnoresInvertColors
      style={[styles.photo, { backgroundColor: colors.muted }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    maxHeight: 260,
    borderRadius: radius.lg,
  },
});
