import React, { useEffect, useReducer, useRef, useState } from 'react';

import { analyzeMeal, toFoodRef, toMealItems } from '../../lib/nutrition/api';
import { defaultSlotMinutes } from '../../lib/nutrition/format';
import type { FoodHit, Meal, MealItem, MealSlot, UserPortion } from '../../types/nutrition';
import { isToday, minutesSinceMidnight } from '../../utils/date';
import * as Haptics from '../../utils/haptics';
import { createId } from '../../utils/id';
import { fileToJpegBase64 } from '../../utils/image';
import { FoodSearch } from './FoodSearch';
import { MealCaptureStep } from './MealCaptureStep';
import { clearMealDraft, saveMealDraft } from './mealDraft';
import { editorReducer, initialEditorState, title as titleOf } from './mealEditorState';
import { MealReviewStep } from './MealReviewStep';
import { PrimaryButton, Sheet } from './Sheet';

export type MealEditorMode = 'photo' | 'text' | 'edit';

export type MealEditorProps = {
  visible: boolean;
  mode: MealEditorMode;
  date: string;
  slot: MealSlot;
  meal?: Meal;
  portions: UserPortion[];
  recentFoods: string[];
  onSave(meal: Omit<Meal, 'id' | 'createdAt' | 'updatedAt'> | Meal): void;
  onClose(): void;
  onRememberPortion(foodKey: string, grams: number): void;
  /** Prefills the note (used when resuming an unfinished draft). */
  initialNote?: string;
};

const TITLES: Record<MealEditorMode, string> = {
  photo: 'Comida por foto',
  text: 'Comida por texto',
  edit: 'Editar comida',
};

const HINT_PORTIONS = 20;

type Step = 'capture' | 'search' | 'review';

/** Capture (photo / note) → analyze → review → save. `edit` opens straight on review. */
export function MealEditor({
  visible,
  mode,
  date,
  slot: initialSlot,
  meal,
  portions,
  recentFoods,
  onSave,
  onClose,
  onRememberPortion,
  initialNote = '',
}: MealEditorProps) {
  const [step, setStep] = useState<Step>(mode === 'edit' ? 'review' : 'capture');
  // Where "Cancelar" in the search goes back to.
  const [searchReturn, setSearchReturn] = useState<'capture' | 'review'>('capture');
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? initialSlot);
  const [note, setNote] = useState(initialNote);
  const [file, setFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(meal?.analysisId ?? null);
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initialEditorState(meal?.items ?? [], meal?.eatenPct ?? 100),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Release the thumbnail's object URL when it changes or the editor goes away.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Photo mode opens the camera right away (some browsers ignore this without a direct tap;
  // the "Tomar foto" button covers that case).
  useEffect(() => {
    if (!visible || mode !== 'photo') return;
    const id = setTimeout(() => inputRef.current?.click(), 0);
    return () => clearTimeout(id);
  }, [visible, mode]);

  const pickPhoto = () => inputRef.current?.click();

  const onFile = (e: { target: { files?: FileList | null; value: string } }) => {
    const picked = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!picked) return;
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setError(null);
  };

  const canAnalyze = (mode === 'photo' && file !== null) || note.trim().length > 0;

  const analyze = async () => {
    if (!canAnalyze || analyzing) return;
    setError(null);
    setAnalyzing(true);
    await saveMealDraft({ date, slot, note, mode: mode === 'photo' ? 'photo' : 'text' });
    try {
      const image = mode === 'photo' && file ? await fileToJpegBase64(file) : undefined;
      // UserPortion only stores the foodKey, so it stands in for the portion's name.
      const hintPortions = [...portions]
        .sort((a, b) => b.samples - a.samples)
        .slice(0, HINT_PORTIONS)
        .map((p) => ({ name: p.foodKey, grams: p.grams }));
      const res = await analyzeMeal({
        image,
        note: note.trim() || undefined,
        slot,
        date,
        hints: { portions: hintPortions, recentFoods },
      });
      if (!mounted.current) return;
      dispatch({ type: 'setItems', items: toMealItems(res) });
      dispatch({ type: 'setQuestion', question: res.question });
      setAnalysisId(res.analysisId);
      setStep('review');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'No se pudo analizar la comida');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      if (mounted.current) setAnalyzing(false);
    }
  };

  const openSearch = (from: 'capture' | 'review') => {
    setSearchReturn(from);
    setStep('search');
  };

  const addHit = (hit: FoodHit) => {
    // The RPC has no default portion; a remembered portion beats the 100 g fallback.
    const remembered = portions.find((p) => p.foodKey === hit.id)?.grams;
    const item: MealItem = {
      id: createId(),
      food: toFoodRef(hit),
      name: hit.name_es,
      grams: remembered ?? 100,
      gramsMin: null,
      gramsMax: null,
      weighed: false,
      confidence: null,
      isHiddenFat: false,
      sortOrder: state.items.length,
    };
    dispatch({ type: 'addItem', item });
    setStep('review');
  };

  const close = () => {
    // Closing on purpose abandons the capture; editing an existing meal never owns a draft.
    if (mode !== 'edit') void clearMealDraft();
    onClose();
  };

  const save = () => {
    if (state.items.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const keepTime = meal && meal.slot === slot && meal.date === date;
    const timeMinutes = keepTime
      ? meal.timeMinutes
      : isToday(date)
        ? minutesSinceMidnight(new Date())
        : defaultSlotMinutes(slot);
    const fields = {
      date,
      slot,
      timeMinutes,
      title: titleOf(state),
      eatenPct: state.eatenPct,
      items: state.items,
      source: meal ? meal.source : mode === 'photo' ? ('photo' as const) : ('text' as const),
      analysisId,
    };
    for (const item of state.items) {
      if (item.food && item.weighed) onRememberPortion(item.food.id, item.grams);
    }
    void clearMealDraft();
    onSave(meal ? { ...meal, ...fields } : fields);
  };

  const captureMode = mode === 'photo' ? 'photo' : 'text';
  const footer =
    step === 'capture' ? (
      <PrimaryButton label="Analizar" onPress={() => void analyze()} disabled={!canAnalyze || analyzing} />
    ) : step === 'review' ? (
      <PrimaryButton label="Guardar" onPress={save} disabled={state.items.length === 0} />
    ) : null;

  return (
    <Sheet visible={visible} title={TITLES[mode]} onClose={close} footer={footer}>
      {mode === 'photo'
        ? React.createElement('input', {
            ref: inputRef,
            type: 'file',
            accept: 'image/*',
            capture: 'environment',
            onChange: onFile,
            style: { display: 'none' },
          })
        : null}
      {step === 'capture' ? (
        <MealCaptureStep
          mode={captureMode}
          slot={slot}
          onSlot={setSlot}
          note={note}
          onNote={setNote}
          previewUrl={previewUrl}
          onPickPhoto={pickPhoto}
          analyzing={analyzing}
          error={error}
          onSearch={() => openSearch('capture')}
        />
      ) : step === 'search' ? (
        <FoodSearch onPick={addHit} onCancel={() => setStep(searchReturn)} />
      ) : (
        <MealReviewStep
          state={state}
          dispatch={dispatch}
          slot={slot}
          onSlot={setSlot}
          onAddItem={() => openSearch('review')}
        />
      )}
    </Sheet>
  );
}
