import { isKnownIcon } from '../theme/icons';
import {
  CATEGORIES,
  REPEAT_KINDS,
  type Category,
  type RepeatKind,
  type Task,
  type TaskDraft,
  type Todo,
  type Weekday,
} from '../types/task';
import { toDayKey } from '../utils/date';

/**
 * Import format for bulk-loading a schedule, e.g. one drafted with an assistant.
 *
 * Times are written as "HH:MM" (24-hour) because that is unambiguous to type and
 * to generate, and converted to minutes-since-midnight internally.
 */

export type ImportResult =
  | { ok: true; tasks: TaskDraft[]; warnings: string[] }
  | { ok: false; error: string };

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  dom: 0, domingo: 0, sun: 0, sunday: 0,
  lun: 1, lunes: 1, mon: 1, monday: 1,
  mar: 2, martes: 2, tue: 2, tuesday: 2,
  mie: 3, 'mié': 3, miercoles: 3, 'miércoles': 3, wed: 3, wednesday: 3,
  jue: 4, jueves: 4, thu: 4, thursday: 4,
  vie: 5, viernes: 5, fri: 5, friday: 5,
  sab: 6, 'sáb': 6, sabado: 6, 'sábado': 6, sat: 6, saturday: 6,
};

const CATEGORY_ALIASES: Record<string, Category> = {
  trabajo: 'work', work: 'work',
  personal: 'personal',
  salud: 'health', health: 'health',
  estudio: 'study', study: 'study',
  otro: 'other', other: 'other',
};

const REPEAT_ALIASES: Record<string, RepeatKind> = {
  ninguna: 'none', none: 'none', 'una vez': 'none', once: 'none',
  diaria: 'daily', diario: 'daily', daily: 'daily', 'cada dia': 'daily', 'cada día': 'daily',
  laborables: 'weekdays', weekdays: 'weekdays', 'lun-vie': 'weekdays', 'lun a vie': 'weekdays',
  personalizada: 'custom', custom: 'custom', dias: 'custom', 'días': 'custom',
};

/** "07:30" or "7:30" -> 450. Returns null for blank/absent values. */
function parseTime(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(24 * 60 - 1, Math.max(0, Math.round(value)));
  }
  if (typeof value !== 'string') {
    warnings.push(`${label}: hora inválida, se dejó sin hora.`);
    return null;
  }
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) {
    warnings.push(`${label}: hora "${value}" no reconocida, se dejó sin hora.`);
    return null;
  }
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix === 'pm' && hours < 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) {
    warnings.push(`${label}: hora "${value}" fuera de rango, se dejó sin hora.`);
    return null;
  }
  return hours * 60 + minutes;
}

function parseCategory(value: unknown, label: string, warnings: string[]): Category {
  if (typeof value !== 'string') return 'other';
  const key = value.trim().toLowerCase();
  const mapped =
    CATEGORY_ALIASES[key] ??
    ((CATEGORIES as readonly string[]).includes(key) ? (key as Category) : undefined);
  if (!mapped) {
    warnings.push(`${label}: categoría "${value}" no reconocida, se usó "Otro".`);
    return 'other';
  }
  return mapped;
}

function parseRepeat(
  value: unknown,
  days: unknown,
  label: string,
  warnings: string[],
): { kind: RepeatKind; days: Weekday[] } {
  let kind: RepeatKind = 'none';
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    const mapped = REPEAT_ALIASES[key] ?? ((REPEAT_KINDS as readonly string[]).includes(key) ? (key as RepeatKind) : undefined);
    if (mapped) kind = mapped;
    else warnings.push(`${label}: repetición "${value}" no reconocida, se usó "una vez".`);
  }

  let parsedDays: Weekday[] = [];
  if (Array.isArray(days)) {
    for (const d of days) {
      if (typeof d === 'number' && d >= 0 && d <= 6) parsedDays.push(d as Weekday);
      else if (typeof d === 'string') {
        const mapped = WEEKDAY_ALIASES[d.trim().toLowerCase()];
        if (mapped !== undefined) parsedDays.push(mapped);
        else warnings.push(`${label}: día "${d}" no reconocido.`);
      }
    }
    parsedDays = Array.from(new Set(parsedDays));
  }

  // Listing days without saying "custom" is a clear enough intent to honour.
  if (kind === 'none' && parsedDays.length > 0) kind = 'custom';
  if (kind === 'custom' && parsedDays.length === 0) {
    warnings.push(`${label}: repetición por días sin días indicados, se usó "una vez".`);
    kind = 'none';
  }

  return { kind, days: kind === 'custom' ? parsedDays : [] };
}

function parseDuration(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(12 * 60, Math.max(5, Math.round(value)));
  }
  return 30;
}

function parseReminder(value: unknown): number | null {
  if (value === null || value === undefined || value === false) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.min(180, Math.round(value));
  }
  return null;
}

/** Parses the pasted document into task drafts, reporting what it could not read. */
export function parseImport(raw: string, defaultDate: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El texto no es un JSON válido. Revisa comillas y comas.' };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { tasks?: unknown }).tasks)
      ? ((parsed as { tasks: unknown[] }).tasks)
      : null;

  if (!list) {
    return {
      ok: false,
      error: 'Se esperaba una lista de actividades, o un objeto con la propiedad "tasks".',
    };
  }
  if (list.length === 0) return { ok: false, error: 'La lista está vacía.' };

  const warnings: string[] = [];
  const tasks: TaskDraft[] = [];

  list.forEach((entry, i) => {
    const label = `Actividad ${i + 1}`;
    if (typeof entry !== 'object' || entry === null) {
      warnings.push(`${label}: no es un objeto, se omitió.`);
      return;
    }
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    if (!title) {
      warnings.push(`${label}: sin "title", se omitió.`);
      return;
    }

    const repeat = parseRepeat(e.repeat, e.days, label, warnings);
    const icon = typeof e.icon === 'string' && isKnownIcon(e.icon) ? e.icon : undefined;
    if (typeof e.icon === 'string' && !icon) {
      warnings.push(`${label}: icono "${e.icon}" no existe, se usó el de la categoría.`);
    }

    tasks.push({
      title,
      notes: typeof e.notes === 'string' && e.notes.trim() ? e.notes.trim() : undefined,
      date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : defaultDate,
      startMinutes: parseTime(e.time ?? e.startTime, label, warnings),
      durationMinutes: parseDuration(e.duration ?? e.durationMinutes),
      category: parseCategory(e.category, label, warnings),
      icon,
      repeat,
      reminderMinutes: parseReminder(e.reminder ?? e.reminderMinutes),
    });
  });

  if (tasks.length === 0) {
    return { ok: false, error: 'No se pudo leer ninguna actividad. ' + warnings.join(' ') };
  }

  return { ok: true, tasks, warnings };
}

/**
 * Full backup: the schedule plus the to-do list and the completion history.
 *
 * The plain import format describes activities only. A backup must also carry
 * `completedDays` and `skippedDays`, or restoring it would silently wipe the
 * streaks and the progress report.
 */
export function buildBackup(tasks: Task[], todos: Todo[]): string {
  return JSON.stringify(
    {
      version: 2,
      kind: 'backup',
      exportedAt: new Date().toISOString(),
      tasks,
      todos,
    },
    null,
    2,
  );
}

export type BackupResult =
  | { ok: true; tasks: Task[]; todos: Todo[] }
  | { ok: false; error: string };

/** Reads a file produced by buildBackup, restoring history as well as content. */
export function parseBackup(raw: string): BackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El texto no es un JSON válido.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'El respaldo no tiene el formato esperado.' };
  }
  const p = parsed as { kind?: unknown; tasks?: unknown; todos?: unknown };
  if (p.kind !== 'backup' || !Array.isArray(p.tasks)) {
    return { ok: false, error: 'Esto no parece un respaldo de day2day.' };
  }

  return {
    ok: true,
    tasks: p.tasks as Task[],
    todos: Array.isArray(p.todos) ? (p.todos as Todo[]) : [],
  };
}

/** Serialises the schedule in the shareable import format (no history). */
export function buildExport(tasks: Task[]): string {
  const toTime = (m: number | null) =>
    m === null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({
      title: t.title,
      time: toTime(t.startMinutes),
      duration: t.durationMinutes,
      category: t.category,
      icon: t.icon,
      repeat: t.repeat.kind,
      ...(t.repeat.kind === 'custom' ? { days: t.repeat.days } : {}),
      ...(t.reminderMinutes !== null ? { reminder: t.reminderMinutes } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
      ...(t.repeat.kind === 'none' ? { date: t.date } : {}),
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/** A worked example that doubles as the format's documentation. */
export function buildSample(): string {
  const today = toDayKey(new Date());
  return JSON.stringify(
    {
      version: 1,
      tasks: [
        {
          title: 'Despertar',
          time: '06:00',
          duration: 10,
          category: 'personal',
          icon: 'sunny-outline',
          repeat: 'daily',
          reminder: 0,
        },
        {
          title: 'Tomar un vaso de agua',
          time: '06:10',
          duration: 5,
          category: 'health',
          icon: 'water-outline',
          repeat: 'daily',
        },
        {
          title: 'Ejercicio',
          time: '06:30',
          duration: 45,
          category: 'health',
          icon: 'barbell-outline',
          repeat: 'weekdays',
          reminder: 10,
          notes: 'Rutina de fuerza, alternar tren superior e inferior.',
        },
        {
          title: 'Clase de inglés',
          time: '19:00',
          duration: 60,
          category: 'study',
          icon: 'language-outline',
          repeat: 'custom',
          days: ['lun', 'mie', 'vie'],
          reminder: 15,
        },
        {
          title: 'Revisar correos',
          time: '09:00',
          duration: 30,
          category: 'work',
          icon: 'mail-outline',
          repeat: 'none',
          date: today,
        },
        {
          title: 'Leer antes de dormir',
          time: '22:00',
          duration: 20,
          category: 'personal',
          icon: 'book-outline',
          repeat: 'daily',
        },
      ],
    },
    null,
    2,
  );
}
