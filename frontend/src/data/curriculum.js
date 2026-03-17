export const MODULES = [
  {
    id: 1,
    title: 'Variables and Print',
    description: 'Learn how to store information and display it on screen',
    icon: '📦',
    topics: ['What is a variable', 'Naming a variable', 'The print function', 'String and number variables'],
    estimatedMinutes: 10,
  },
  {
    id: 2,
    title: 'Data Types',
    description: 'Understand integers, floats, strings, and booleans',
    icon: '🔢',
    topics: ['Integers', 'Floats', 'Strings', 'Booleans', 'The type function'],
    estimatedMinutes: 12,
  },
  {
    id: 3,
    title: 'Conditionals',
    description: 'Make decisions in your code using if, elif, and else',
    icon: '🔀',
    topics: ['if statement', 'else clause', 'elif clause', 'Comparison operators'],
    estimatedMinutes: 15,
  },
  {
    id: 4,
    title: 'Loops',
    description: 'Repeat actions automatically using for and while loops',
    icon: '🔁',
    topics: ['for loop', 'while loop', 'range function', 'break and continue'],
    estimatedMinutes: 15,
  },
  {
    id: 5,
    title: 'Functions',
    description: 'Write reusable blocks of code with def and return',
    icon: '⚡',
    topics: ['Defining a function', 'Parameters', 'Return values', 'Calling a function'],
    estimatedMinutes: 18,
  },
]

export const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const SHORTCUTS = [
  { keys: 'J or F', action: 'Interrupt lesson and ask a question' },
  { keys: 'R', action: 'Replay last spoken message' },
  { keys: 'Q', action: 'Start quiz for current module' },
  { keys: 'N', action: 'Next module' },
  { keys: 'P', action: 'Previous module' },
  { keys: 'H', action: 'Hear all shortcuts' },
  { keys: 'Esc', action: 'Stop speaking' },
  { keys: 'Alt + C', action: 'Toggle high contrast' },
  { keys: 'Alt + 1–4', action: 'Change font size' },
]
