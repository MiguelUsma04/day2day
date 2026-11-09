import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';
import type { Question } from '../../types/nutrition';
import { Chip, sheetStyles } from './Sheet';

type Props = {
  question: Question;
  onAnswer: (optionIndex: number) => void;
};

/** The one follow-up question from the analysis, answered with a tap. */
export function ChipQuestion({ question, onAnswer }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.foreground }]}>{question.text}</Text>
      <View style={sheetStyles.chips}>
        {question.options.map((option, index) => (
          <Chip key={`${option.label}-${index}`} label={option.label} active={false} onPress={() => onAnswer(index)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  text: { fontFamily: fontFamily.semibold, fontSize: fontSize.footnote },
});
