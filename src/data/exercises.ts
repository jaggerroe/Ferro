/**
 * Ferro's built-in exercise library.
 *
 * Every exercise is tagged with a main muscle group, optional secondary
 * muscles, and the equipment it uses. Those tags power sorting and
 * filtering, and later the "suggested workout" feature.
 */

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Full Body',
  'Cardio',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Smith Machine',
  'Bodyweight',
  'Kettlebell',
  'Band',
  'Cardio Machine',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** How sets are logged: weight × reps, reps only, or time + distance. */
export type ExerciseKind = 'strength' | 'bodyweight' | 'cardio';

export type Exercise = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  kind: ExerciseKind;
};

/** Turns "Bench Press" into "bench-press" so every exercise has a stable id. */
function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Small helper so each exercise below fits on one line. */
function ex(
  name: string,
  muscle: MuscleGroup,
  equipment: Equipment,
  secondary: MuscleGroup[] = [],
): Exercise {
  const kind: ExerciseKind =
    muscle === 'Cardio' ? 'cardio' : equipment === 'Bodyweight' ? 'bodyweight' : 'strength';
  return { id: slug(name), name, muscle, secondary, equipment, kind };
}

export const EXERCISES: Exercise[] = [
  // Chest
  ex('Bench Press', 'Chest', 'Barbell', ['Triceps', 'Shoulders']),
  ex('Incline Bench Press', 'Chest', 'Barbell', ['Shoulders', 'Triceps']),
  ex('Dumbbell Bench Press', 'Chest', 'Dumbbell', ['Triceps', 'Shoulders']),
  ex('Incline Dumbbell Press', 'Chest', 'Dumbbell', ['Shoulders', 'Triceps']),
  ex('Dumbbell Fly', 'Chest', 'Dumbbell'),
  ex('Cable Fly', 'Chest', 'Cable'),
  ex('Chest Press Machine', 'Chest', 'Machine', ['Triceps']),
  ex('Pec Deck', 'Chest', 'Machine'),
  ex('Smith Machine Bench Press', 'Chest', 'Smith Machine', ['Triceps']),
  ex('Push-up', 'Chest', 'Bodyweight', ['Triceps', 'Shoulders']),
  ex('Dip', 'Chest', 'Bodyweight', ['Triceps']),

  // Back
  ex('Deadlift', 'Back', 'Barbell', ['Hamstrings', 'Glutes']),
  ex('Barbell Row', 'Back', 'Barbell', ['Biceps']),
  ex('Dumbbell Row', 'Back', 'Dumbbell', ['Biceps']),
  ex('T-Bar Row', 'Back', 'Machine', ['Biceps']),
  ex('Lat Pulldown', 'Back', 'Cable', ['Biceps']),
  ex('Seated Cable Row', 'Back', 'Cable', ['Biceps']),
  ex('Straight-Arm Pulldown', 'Back', 'Cable'),
  ex('Machine Row', 'Back', 'Machine', ['Biceps']),
  ex('Pull-up', 'Back', 'Bodyweight', ['Biceps']),
  ex('Chin-up', 'Back', 'Bodyweight', ['Biceps']),
  ex('Inverted Row', 'Back', 'Bodyweight', ['Biceps']),
  ex('Barbell Shrug', 'Back', 'Barbell'),
  ex('Dumbbell Shrug', 'Back', 'Dumbbell'),

  // Shoulders
  ex('Overhead Press', 'Shoulders', 'Barbell', ['Triceps']),
  ex('Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell', ['Triceps']),
  ex('Arnold Press', 'Shoulders', 'Dumbbell', ['Triceps']),
  ex('Machine Shoulder Press', 'Shoulders', 'Machine', ['Triceps']),
  ex('Lateral Raise', 'Shoulders', 'Dumbbell'),
  ex('Cable Lateral Raise', 'Shoulders', 'Cable'),
  ex('Front Raise', 'Shoulders', 'Dumbbell'),
  ex('Rear Delt Fly', 'Shoulders', 'Dumbbell', ['Back']),
  ex('Reverse Pec Deck', 'Shoulders', 'Machine', ['Back']),
  ex('Face Pull', 'Shoulders', 'Cable', ['Back']),
  ex('Handstand Push-up', 'Shoulders', 'Bodyweight', ['Triceps']),

  // Biceps
  ex('Barbell Curl', 'Biceps', 'Barbell', ['Forearms']),
  ex('EZ-Bar Curl', 'Biceps', 'Barbell', ['Forearms']),
  ex('Dumbbell Curl', 'Biceps', 'Dumbbell', ['Forearms']),
  ex('Hammer Curl', 'Biceps', 'Dumbbell', ['Forearms']),
  ex('Incline Dumbbell Curl', 'Biceps', 'Dumbbell'),
  ex('Preacher Curl', 'Biceps', 'Machine'),
  ex('Cable Curl', 'Biceps', 'Cable'),
  ex('Band Curl', 'Biceps', 'Band'),

  // Triceps
  ex('Close-Grip Bench Press', 'Triceps', 'Barbell', ['Chest']),
  ex('Skull Crusher', 'Triceps', 'Barbell'),
  ex('Tricep Pushdown', 'Triceps', 'Cable'),
  ex('Overhead Cable Extension', 'Triceps', 'Cable'),
  ex('Overhead Dumbbell Extension', 'Triceps', 'Dumbbell'),
  ex('Dumbbell Kickback', 'Triceps', 'Dumbbell'),
  ex('Bench Dip', 'Triceps', 'Bodyweight'),

  // Forearms
  ex('Wrist Curl', 'Forearms', 'Dumbbell'),
  ex("Farmer's Carry", 'Forearms', 'Dumbbell', ['Full Body']),

  // Quads
  ex('Squat', 'Quads', 'Barbell', ['Glutes', 'Hamstrings']),
  ex('Front Squat', 'Quads', 'Barbell', ['Glutes', 'Core']),
  ex('Goblet Squat', 'Quads', 'Dumbbell', ['Glutes']),
  ex('Leg Press', 'Quads', 'Machine', ['Glutes']),
  ex('Hack Squat', 'Quads', 'Machine', ['Glutes']),
  ex('Smith Machine Squat', 'Quads', 'Smith Machine', ['Glutes']),
  ex('Leg Extension', 'Quads', 'Machine'),
  ex('Bulgarian Split Squat', 'Quads', 'Dumbbell', ['Glutes']),
  ex('Walking Lunge', 'Quads', 'Dumbbell', ['Glutes']),
  ex('Bodyweight Squat', 'Quads', 'Bodyweight', ['Glutes']),
  ex('Pistol Squat', 'Quads', 'Bodyweight', ['Glutes']),

  // Hamstrings
  ex('Romanian Deadlift', 'Hamstrings', 'Barbell', ['Glutes', 'Back']),
  ex('Dumbbell Romanian Deadlift', 'Hamstrings', 'Dumbbell', ['Glutes']),
  ex('Lying Leg Curl', 'Hamstrings', 'Machine'),
  ex('Seated Leg Curl', 'Hamstrings', 'Machine'),
  ex('Good Morning', 'Hamstrings', 'Barbell', ['Back']),
  ex('Nordic Curl', 'Hamstrings', 'Bodyweight'),

  // Glutes
  ex('Hip Thrust', 'Glutes', 'Barbell', ['Hamstrings']),
  ex('Glute Bridge', 'Glutes', 'Bodyweight', ['Hamstrings']),
  ex('Cable Kickback', 'Glutes', 'Cable'),
  ex('Hip Abduction Machine', 'Glutes', 'Machine'),
  ex('Kettlebell Swing', 'Glutes', 'Kettlebell', ['Hamstrings', 'Full Body']),

  // Calves
  ex('Standing Calf Raise', 'Calves', 'Machine'),
  ex('Seated Calf Raise', 'Calves', 'Machine'),
  ex('Dumbbell Calf Raise', 'Calves', 'Dumbbell'),

  // Core
  ex('Plank', 'Core', 'Bodyweight'),
  ex('Hanging Leg Raise', 'Core', 'Bodyweight'),
  ex('Crunch', 'Core', 'Bodyweight'),
  ex('Cable Crunch', 'Core', 'Cable'),
  ex('Ab Wheel Rollout', 'Core', 'Bodyweight'),
  ex('Russian Twist', 'Core', 'Bodyweight'),
  ex('Pallof Press', 'Core', 'Band'),

  // Full body
  ex('Power Clean', 'Full Body', 'Barbell', ['Back', 'Quads']),
  ex('Thruster', 'Full Body', 'Barbell', ['Quads', 'Shoulders']),
  ex('Burpee', 'Full Body', 'Bodyweight'),
  ex('Kettlebell Goblet Squat', 'Quads', 'Kettlebell', ['Glutes']),

  // Cardio
  ex('Running', 'Cardio', 'Bodyweight'),
  ex('Treadmill', 'Cardio', 'Cardio Machine'),
  ex('Stationary Bike', 'Cardio', 'Cardio Machine'),
  ex('Rowing Machine', 'Cardio', 'Cardio Machine', ['Back']),
  ex('Stair Climber', 'Cardio', 'Cardio Machine', ['Glutes']),
  ex('Elliptical', 'Cardio', 'Cardio Machine'),
  ex('Jump Rope', 'Cardio', 'Bodyweight', ['Calves']),
];
