import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import type { Workout, WorkoutStatus } from '@/types/workout';

const DB_NAME = 'workouts.db';

/** Format Date for DB date column (date-only, YYYY-MM-DD). */
function dateToDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse DB date string to Date (local date, no time). */
function dateStringToDate(s: string): Date {
  const d = new Date(s + 'T00:00:00.000Z');
  return d;
}

const INIT_SQL = `
  DROP TABLE IF EXISTS workouts;
  CREATE TABLE workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    exercise_type TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    distance_meters INTEGER NOT NULL,
    load REAL NOT NULL,
    created_at TEXT NOT NULL
  );
`;

let initialized = false;

async function getDb() {
  try {
    return await SQLite.openDatabaseAsync(DB_NAME);
  } catch (error) {
    console.error('getDb failed', {
      error,
      dbName: DB_NAME,
      platform: Platform.OS,
    });
    throw error;
  }
}

export async function ensureWorkoutsTable() {
  if (initialized) return;
  try {
    const db = await getDb();
    await db.execAsync(INIT_SQL);
    initialized = true;
  } catch (error) {
    console.error('ensureWorkoutsTable failed', { error });
    throw error;
  }
}

type SeedWorkout = Omit<Workout, 'id' | 'date' | 'createdAt'> & {
  date: string;
  createdAt: string;
};

const SEED_WORKOUTS: SeedWorkout[] = [
  {
    title: 'Easy run',
    description: null,
    date: '2026-01-04',
    status: 'completed',
    exerciseType: 'run',
    durationSec: 30 * 60,
    distanceMeters: 5000,
    load: 0,
    createdAt: '2026-01-04T08:00:00.000Z',
  },
  {
    title: 'Intervals',
    description: '6 x 400m',
    date: '2026-01-12',
    status: 'pending',
    exerciseType: 'run',
    durationSec: 45 * 60,
    distanceMeters: 2400,
    load: 0,
    createdAt: '2026-01-12T08:00:00.000Z',
  },
  {
    title: 'Tempo ride',
    description: null,
    date: '2026-01-20',
    status: 'completed',
    exerciseType: 'cycle',
    durationSec: 50 * 60,
    distanceMeters: 18000,
    load: 0,
    createdAt: '2026-01-20T08:00:00.000Z',
  },
  {
    title: 'Recovery jog',
    description: null,
    date: '2026-02-03',
    status: 'completed',
    exerciseType: 'run',
    durationSec: 20 * 60,
    distanceMeters: 3000,
    load: 0,
    createdAt: '2026-02-03T08:00:00.000Z',
  },
  {
    title: 'Long run',
    description: null,
    date: '2026-02-14',
    status: 'pending',
    exerciseType: 'run',
    durationSec: 75 * 60,
    distanceMeters: 12000,
    load: 0,
    createdAt: '2026-02-14T08:00:00.000Z',
  },
  {
    title: 'Pool session',
    description: '1,500 m drills',
    date: '2026-02-27',
    status: 'error',
    exerciseType: 'swim',
    durationSec: 30 * 60,
    distanceMeters: 1500,
    load: 0,
    createdAt: '2026-02-27T08:00:00.000Z',
  },
];

async function seedWorkoutsFor2026IfNeeded() {
  try {
    const db = await getDb();
    const existing = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM workouts WHERE date >= ? AND date <= ?',
      ['2026-01-01', '2026-02-28']
    );
    if ((existing?.count ?? 0) > 0) return;

    for (const workout of SEED_WORKOUTS) {
      await db.runAsync(
        'INSERT INTO workouts (title, description, date, status, exercise_type, duration_sec, distance_meters, load, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        workout.title,
        workout.description,
        workout.date,
        workout.status,
        workout.exerciseType,
        workout.durationSec,
        workout.distanceMeters,
        workout.load,
        workout.createdAt
      );
    }
  } catch (error) {
    console.error('seedWorkoutsFor2026IfNeeded failed', { error });
    throw error;
  }
}

type WorkoutRow = {
  id: number;
  title: string;
  description: string | null;
  date: string;
  status: WorkoutStatus;
  exercise_type: string;
  duration_sec: number;
  distance_meters: number;
  load: number;
  created_at: string;
};

export async function fetchWorkoutsFromDB(): Promise<Workout[]> {
  try {
    await ensureWorkoutsTable();
    await seedWorkoutsFor2026IfNeeded();
    const db = await getDb();
    const rows = await db.getAllAsync<WorkoutRow>(
      'SELECT id, title, description, date, status, exercise_type, duration_sec, distance_meters, load, created_at FROM workouts ORDER BY date DESC, id DESC'
    );
    return rows.map((row: WorkoutRow) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      date: dateStringToDate(row.date),
      status: row.status,
      exerciseType: row.exercise_type as Workout['exerciseType'],
      durationSec: row.duration_sec,
      distanceMeters: row.distance_meters,
      load: row.load,
      createdAt: new Date(row.created_at),
    }));
  } catch (error) {
    console.error('fetchWorkoutsFromDB failed', { error });
    throw error;
  }
}

type CreateWorkoutInput = {
  title: string;
  description?: string | null;
  date: Date;
  status?: WorkoutStatus;
  exerciseType?: Workout['exerciseType'];
  durationSec?: number;
  distanceMeters?: number;
  load?: number;
};

export async function createWorkoutInDB({
  title,
  description = null,
  date,
  status = 'pending',
  exerciseType = 'run',
  durationSec = 0,
  distanceMeters = 0,
  load = 0,
}: CreateWorkoutInput): Promise<Workout> {
  try {
    await ensureWorkoutsTable();
    const db = await getDb();
    const createdAt = new Date();
    const result = await db.runAsync(
      'INSERT INTO workouts (title, description, date, status, exercise_type, duration_sec, distance_meters, load, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      title,
      description,
      dateToDateString(date),
      status,
      exerciseType,
      durationSec,
      distanceMeters,
      load,
      createdAt.toISOString()
    );
    return {
      id: result.lastInsertRowId,
      title,
      description,
      date,
      status,
      exerciseType,
      durationSec,
      distanceMeters,
      load,
      createdAt,
    };
  } catch (error) {
    console.error('createWorkoutInDB failed', { error });
    throw error;
  }
}

type UpdateWorkoutInput = {
  id: number;
  title: string;
  description?: string | null;
  date?: Date;
  status: WorkoutStatus;
  exerciseType?: Workout['exerciseType'];
  durationSec?: number;
  distanceMeters?: number;
  load?: number;
};

export async function updateWorkoutInDB({
  id,
  title,
  description = null,
  date,
  status,
  exerciseType,
  durationSec,
  distanceMeters,
  load,
}: UpdateWorkoutInput): Promise<Workout> {
  try {
    await ensureWorkoutsTable();
    const db = await getDb();
    const existing = await db.getFirstAsync<WorkoutRow>(
      'SELECT id, title, description, date, status, exercise_type, duration_sec, distance_meters, load, created_at FROM workouts WHERE id = ?',
      id
    );
    if (!existing) {
      throw new Error(`Workout not found for update: ${id}`);
    }
    const exercise_type = exerciseType ?? existing.exercise_type;
    const duration_sec = durationSec ?? existing.duration_sec;
    const distance_meters = distanceMeters ?? existing.distance_meters;
    const loadVal = load ?? existing.load;
    const dateStr = date != null ? dateToDateString(date) : existing.date;

    await db.runAsync(
      'UPDATE workouts SET title = ?, description = ?, date = ?, status = ?, exercise_type = ?, duration_sec = ?, distance_meters = ?, load = ? WHERE id = ?',
      title,
      description,
      dateStr,
      status,
      exercise_type,
      duration_sec,
      distance_meters,
      loadVal,
      id
    );
    return {
      id: existing.id,
      title,
      description,
      date: dateStringToDate(dateStr),
      status,
      exerciseType: exercise_type as Workout['exerciseType'],
      durationSec: duration_sec,
      distanceMeters: distance_meters,
      load: loadVal,
      createdAt: new Date(existing.created_at),
    };
  } catch (error) {
    console.error('updateWorkoutInDB failed', { error, id });
    throw error;
  }
}

export async function deleteWorkoutInDB(id: number): Promise<void> {
  try {
    await ensureWorkoutsTable();
    const db = await getDb();
    await db.runAsync('DELETE FROM workouts WHERE id = ?', id);
  } catch (error) {
    console.error('deleteWorkoutInDB failed', { error, id });
    throw error;
  }
}
