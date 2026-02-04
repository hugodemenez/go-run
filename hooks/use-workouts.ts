import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createWorkoutInDB, fetchWorkoutsFromDB, updateWorkoutInDB } from '@/db/workouts';

export function useWorkouts() {
  return useQuery({
    queryKey: ['workouts'],
    queryFn: fetchWorkoutsFromDB,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkoutInDB,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
  });
}

export function useUpdateWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWorkoutInDB,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workouts'] });
    },
  });
}
