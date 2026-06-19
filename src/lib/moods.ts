export const moodBefore = {
  NEEDS_WORK: "😕 ausbaufaehig",
  OKAY: "🙁 okay",
  NEUTRAL: "😐 neutral",
  PLEASANT: "🙂 angenehm",
  VERY_PLEASANT: "😄 sehr angenehm"
} as const;

export const moodAfter = {
  WORSE: "😕 verschlechtert",
  UNCHANGED: "🙁 unveraendert",
  SLIGHTLY_BETTER: "😐 leicht verbessert",
  MUCH_BETTER: "🙂 deutlich verbessert",
  RELAXED: "😄 total entspannt"
} as const;

export const moodScore = {
  NEEDS_WORK: 1,
  OKAY: 2,
  NEUTRAL: 3,
  PLEASANT: 4,
  VERY_PLEASANT: 5,
  WORSE: 1,
  UNCHANGED: 2,
  SLIGHTLY_BETTER: 3,
  MUCH_BETTER: 4,
  RELAXED: 5
} as const;

export const neutralMood = "😐 neutral";
