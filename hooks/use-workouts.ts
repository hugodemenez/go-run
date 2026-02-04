import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Workout } from '@/types/workout';

import { createWorkoutInDB, fetchWorkoutsFromDB, updateWorkoutInDB } from '@/db/workouts';

export function useWorkouts() {
  return useQuery({
    queryKey: ['workouts'],
    queryFn: fetchWorkoutsFromDB,
    staleTime: 0,
    gcTime: 0,
  });
}

function sortWorkouts(workouts: Workout[]) {
  return workouts.slice().sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.id - a.id;
  });
}

function upsertWorkout(previous: Workout[] | undefined, workout: Workout) {
  if (!previous || previous.length === 0) return [workout];
  const index = previous.findIndex((item) => item.id === workout.id);
  if (index === -1) return sortWorkouts([...previous, workout]);
  const next = previous.slice();
  next[index] = workout;
  return sortWorkouts(next);
}

export function useCreateWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkoutInDB,
    onSuccess: (createdWorkout) => {
      queryClient.setQueryData(['workouts'], (previous: Workout[] | undefined) =>
        upsertWorkout(previous, createdWorkout)
      );
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
  });
}

export function useUpdateWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWorkoutInDB,
    onSuccess: (updatedWorkout) => {
      queryClient.setQueryData(['workouts'], (previous: Workout[] | undefined) =>
        upsertWorkout(previous, updatedWorkout)
      );
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
  });
}
