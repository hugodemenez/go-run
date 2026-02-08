import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

import type { Workout, WorkoutStatus } from '@/types/workout';

const DB_NAME = 'workouts.db';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
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
  console.log('ensureWorkoutsTable');
  if (initialized) return;
  console.log('ensureWorkoutsTable 2');
  try {
    const db = await getDb();
    await db.execAsync(CREATE_TABLE_SQL);
    initialized = true;
  } catch (error) {
    console.error('ensureWorkoutsTable failed', { error });
    throw error;
  }
}

const SEED_WORKOUTS: Omit<Workout, 'id'>[] = [
  {
    title: 'Easy run',
    description: '30 min · 5 km',
    date: '2026-01-04',
    status: 'completed',
    createdAt: '2026-01-04T08:00:00.000Z',
  },
  {
    title: 'Intervals',
    description: '6 x 400m · 45 min',
    date: '2026-01-12',
    status: 'pending',
    createdAt: '2026-01-12T08:00:00.000Z',
  },
  {
    title: 'Tempo ride',
    description: '50 min · 18 km',
    date: '2026-01-20',
    status: 'completed',
    createdAt: '2026-01-20T08:00:00.000Z',
  },
  {
    title: 'Recovery jog',
    description: '20 min · 3 km',
    date: '2026-02-03',
    status: 'completed',
    createdAt: '2026-02-03T08:00:00.000Z',
  },
  {
    title: 'Long run',
    description: '75 min · 12 km',
    date: '2026-02-14',
    status: 'pending',
    createdAt: '2026-02-14T08:00:00.000Z',
  },
  {
    title: 'Pool session',
    description: '1,500 m drills',
    date: '2026-02-27',
    status: 'error',
    createdAt: '2026-02-27T08:00:00.000Z',
  },
];

async function seedWorkoutsFor2026IfNeeded() {
  try {
    const db = await getDb();
    const existing = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM workouts WHERE date >= ? AND date <= ?'
      ,
      ['2026-01-01', '2026-02-28']
    );
    if ((existing?.count ?? 0) > 0) return;

    for (const workout of SEED_WORKOUTS) {
      await db.runAsync(
        'INSERT INTO workouts (title, description, date, status, created_at) VALUES (?, ?, ?, ?, ?)',
        workout.title,
        workout.description,
        workout.date,
        workout.status,
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
  created_at: string;
};

export async function fetchWorkoutsFromDB(): Promise<Workout[]> {
  try {
    await ensureWorkoutsTable();
    console.log('fetchWorkoutsFromDB');
    await seedWorkoutsFor2026IfNeeded();
    const db = await getDb();
    const rows = await db.getAllAsync<WorkoutRow>(
      'SELECT id, title, description, date, status, created_at FROM workouts ORDER BY date DESC, id DESC'
    );
    return rows.map((row: WorkoutRow) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      date: row.date,
      status: row.status,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('fetchWorkoutsFromDB failed', { error });
    throw error;
  }
}

type CreateWorkoutInput = {
  title: string;
  description?: string | null;
  date: string;
  status?: WorkoutStatus;
};

export async function createWorkoutInDB({
  title,
  description = null,
  date,
  status = 'pending',
}: CreateWorkoutInput): Promise<Workout> {
  try {
    await ensureWorkoutsTable();
    const db = await getDb();
    const createdAt = new Date().toISOString();
    const result = await db.runAsync(
      'INSERT INTO workouts (title, description, date, status, created_at) VALUES (?, ?, ?, ?, ?)',
      title,
      description,
      date,
      status,
      createdAt
    );
    return {
      id: result.lastInsertRowId,
      title,
      description,
      date,
      status,
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
  date: string;
  status: WorkoutStatus;
};

export async function updateWorkoutInDB({
  id,
  title,
  description = null,
  date,
  status,
}: UpdateWorkoutInput): Promise<Workout> {
  try {
    await ensureWorkoutsTable();
    const db = await getDb();
    await db.runAsync(
      'UPDATE workouts SET title = ?, description = ?, date = ?, status = ? WHERE id = ?',
      title,
      description,
      date,
      status,
      id
    );
    const existing = await db.getFirstAsync<WorkoutRow>(
      'SELECT id, title, description, date, status, created_at FROM workouts WHERE id = ?',
      id
    );
    if (!existing) {
      throw new Error(`Workout not found for update: ${id}`);
    }
    return {
      id: existing.id,
      title: existing.title,
      description: existing.description,
      date: existing.date,
      status: existing.status,
      createdAt: existing.created_at,
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
