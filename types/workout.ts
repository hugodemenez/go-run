export type WorkoutStatus = 'pending' | 'completed' | 'error';

export type Workout = {
  id: number;
  title: string;
  description: string | null;
  date: string;
  status: WorkoutStatus;
  createdAt: string;
};
