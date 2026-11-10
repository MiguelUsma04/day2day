import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../lib/nutrition/format';
import { KCAL_FLOOR, KCAL_PER_KG, RATE_RANGE, type DailyTarget } from '../../lib/nutrition/targets';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';
import type { Goal, Profile } from '../../types/nutrition';
import { Sheet } from './Sheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  target: DailyTarget | null;
  profile: Profile | null;
  weightKg: number;
};

const GOAL_LABEL: Record<Goal, string> = {
  lose_fat: 'Bajar grasa',
  maintain: 'Mantener / recomposición',
  gain_muscle: 'Ganar músculo',
};

const ACTIVITY_LABEL: Record<number, string> = { 1.2: 'Sedentario', 1.375: 'Ligero', 1.55: 'Moderado' };

const METHOD_LABEL: Record<DailyTarget['method'], string> = {
  measured: 'medido en bioimpedancia',
  katch: 'Katch-McArdle, por tu % de grasa',
  mifflin: 'Mifflin-St Jeor, por sexo, edad, talla y peso',
};

/** Protein rule per goal, mirrored from targets.ts for the table. */
const PROTEIN_RULE: Record<Goal, number> = { lose_fat: 1.8, maintain: 1.6, gain_muscle: 2.0 };

function gPerKg(n: number): string {
  return `${n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g/kg`;
}

function kcalPerDay(rateKgPerWeek: number): number {
  return Math.round((rateKgPerWeek * KCAL_PER_KG) / 7);
}

function signed(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;
}

function rate(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
}

/** Explains where today's target comes from and what each goal expects. */
export function TargetInfoSheet({ visible, onClose, target, profile, weightKg }: Props) {
  const { colors } = useTheme();
  const muted = { color: colors.mutedForeground };
  const fg = { color: colors.foreground };

  const workoutKcal = target && profile ? Math.round(target.tdee - target.bmr * profile.activityFactor) : 0;
  const adjust = profile ? kcalPerDay(profile.weeklyRateKg) : 0;

  return (
    <Sheet visible={visible} title="Cómo se calcula tu meta" onClose={onClose}>
      {target && profile ? (
        <View style={styles.section}>
          <Text style={[styles.h, fg]}>Tu cálculo de hoy</Text>
          <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Row label={`Gasto en reposo (BMR, ${METHOD_LABEL[target.method]})`} value={`${formatNumber(target.bmr)} kcal`} />
            <Row
              label={`× Actividad base (${ACTIVITY_LABEL[profile.activityFactor] ?? profile.activityFactor})`}
              value={`${formatNumber(target.bmr * profile.activityFactor)} kcal`}
            />
            <Row label="+ Entrenos registrados hoy" value={`${signed(workoutKcal)} kcal`} />
            <Row label="= Gasto del día" value={`${formatNumber(target.tdee)} kcal`} bold />
            <Row
              label={`Ajuste por tu ritmo (${rate(profile.weeklyRateKg)} kg/semana)`}
              value={`${signed(adjust)} kcal`}
            />
            {target.floorApplied ? (
              <Row label={`Piso de seguridad (${formatNumber(KCAL_FLOOR[profile.sex])} kcal)`} value="aplicado" />
            ) : null}
            <Row label="= Tu meta de hoy" value={`${formatNumber(target.kcal)} kcal`} bold accent />
            <Row
              label={`Proteína (${gPerKg(profile.proteinGPerKg ?? PROTEIN_RULE[profile.goal])} × ${formatNumber(weightKg)} kg)`}
              value={`${formatNumber(target.proteinG)} g`}
            />
            <Row label="Grasa (0,8 g/kg)" value={`${formatNumber(target.fatG)} g`} />
            <Row label="Carbohidratos (lo que queda)" value={`${formatNumber(target.carbsG)} g`} />
          </View>
        </View>
      ) : (
        <Text style={[styles.p, muted]}>Registra tu peso y crea tu perfil para ver el cálculo de hoy.</Text>
      )}

      <View style={styles.section}>
        <Text style={[styles.h, fg]}>Cómo funciona</Text>
        <Bullet>
          <B>Gasto</B> es lo que tu cuerpo quema en el día: reposo + vida diaria + entrenos. Si comes eso, el peso no
          cambia.
        </Bullet>
        <Bullet>
          <B>La meta ya incluye el déficit o el superávit.</B> Para bajar grasa la meta está por debajo del gasto; para
          ganar músculo, por encima. No hay que restarle nada más.
        </Bullet>
        <Bullet>
          <B>Come hasta la meta, no menos.</B> Comer bastante menos no acelera: pierdes músculo, baja la energía y
          llega el rebote. Pasarse un día tampoco arruina nada; cuenta la semana.
        </Bullet>
        <Bullet>
          <B>Registra los entrenos.</B> Ese día la meta sube lo que gastaste. Sin registro, la app asume que no
          entrenaste.
        </Bullet>
        <Bullet>
          <B>Manda la tendencia</B> (promedio de 7 días en Progreso), no la báscula de un día. Si en 2 o 3 semanas la
          tendencia no va al ritmo elegido, ajusta la meta 100 a 150 kcal.
        </Bullet>
        <Bullet>
          <B>Proteína alta</B> en todos los objetivos: protege el músculo cuando bajas y lo construye cuando subes.
        </Bullet>
      </View>

      <View style={styles.section}>
        <Text style={[styles.h, fg]}>Valores por objetivo</Text>
        <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <TableRow head cells={['Objetivo', 'Ritmo/sem', 'kcal/día', 'Proteína']} />
          {(Object.keys(RATE_RANGE) as Goal[]).map((goal) => {
            const [min, max] = RATE_RANGE[goal];
            const active = profile?.goal === goal;
            return (
              <TableRow
                key={goal}
                active={active}
                cells={[
                  GOAL_LABEL[goal],
                  min === max ? rate(min) : `${rate(min)} a ${rate(max)} kg`,
                  min === max ? '0' : `${signed(kcalPerDay(min))} a ${signed(kcalPerDay(max))}`,
                  gPerKg(PROTEIN_RULE[goal]),
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.p, muted]}>
          Grasa mínima 0,8 g/kg en todos. Piso de seguridad: 1.200 kcal mujer, 1.500 kcal hombre. 1 kg de grasa son
          unas 7.700 kcal: a −0,5 kg/semana son −550 kcal al día.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.h, fg]}>Cuál elegir</Text>
        <Bullet>
          <B>Bajar grasa</B>: déficit de 0,25 a 0,7 kg por semana. Cuanto más grasa tengas, más rápido puedes ir sin
          perder músculo. Fuerza 3 o 4 veces por semana y proteína alta.
        </Bullet>
        <Bullet>
          <B>Recomposición</B>: comer el gasto (ritmo 0), proteína 1,8 a 2,0 g/kg y fuerza progresiva. Baja la grasa y
          sube el músculo a la vez, despacio. Funciona bien al empezar a entrenar o con % de grasa alto.
        </Bullet>
        <Bullet>
          <B>Ganar músculo</B>: superávit pequeño, 0,1 a 0,3 kg por semana. Más que eso es grasa, no músculo. Si la
          tendencia sube más rápido, baja 100 kcal.
        </Bullet>
      </View>
    </Sheet>
  );
}

function Row({
  label,
  value,
  bold = false,
  accent = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  const family = bold ? fontFamily.bold : fontFamily.regular;
  const color = accent ? colors.primary : bold ? colors.foreground : colors.mutedForeground;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { fontFamily: family, color }]}>{label}</Text>
      <Text style={[styles.rowValue, { fontFamily: bold ? fontFamily.bold : fontFamily.semibold, color }]}>{value}</Text>
    </View>
  );
}

function TableRow({ cells, head = false, active = false }: { cells: string[]; head?: boolean; active?: boolean }) {
  const { colors } = useTheme();
  const color = head ? colors.mutedForeground : active ? colors.primary : colors.foreground;
  const family = head ? fontFamily.semibold : active ? fontFamily.bold : fontFamily.regular;
  return (
    <View style={[styles.trow, head ? { borderBottomColor: colors.border, borderBottomWidth: 1 } : null]}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.cell, i === 0 ? styles.cellFirst : null, { color, fontFamily: family }]}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.bullet}>
      <Text style={[styles.dot, { color: colors.primary }]}>•</Text>
      <Text style={[styles.p, { color: colors.foreground, flex: 1 }]}>{children}</Text>
    </View>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontFamily: fontFamily.bold }}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  h: { fontFamily: fontFamily.bold, fontSize: fontSize.footnote },
  p: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 20 },
  box: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { flex: 1, fontSize: fontSize.label, lineHeight: 20 },
  rowValue: { fontSize: fontSize.label, lineHeight: 20, textAlign: 'right' },
  trow: { flexDirection: 'row', paddingVertical: spacing.xs, gap: spacing.xs },
  cell: { flex: 1, fontSize: fontSize.caption, lineHeight: 18 },
  cellFirst: { flex: 1.4 },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  dot: { fontFamily: fontFamily.bold, fontSize: fontSize.label, lineHeight: 20 },
});
