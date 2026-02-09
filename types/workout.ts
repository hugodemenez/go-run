export type WorkoutStatus = 'pending' | 'completed' | 'error';

export type ExerciseType = 'run' | 'walk' | 'cycle' | 'swim';

export type Workout = {
  id: number;
  title: string;
  description: string | null;
  date: Date;
  status: WorkoutStatus;
  exerciseType: ExerciseType;
  durationSec: number;
  distanceMeters: number;
  load: number;
  createdAt: Date;
};
