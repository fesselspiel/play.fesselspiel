ALTER TABLE "TrackerType"
ADD COLUMN "quotaReminderSchedule" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "TrackerType"
SET "quotaReminderSchedule" = jsonb_build_object(
  'daily', jsonb_build_object(
    'enabled', "quotaReminderEnabled" AND "quotaDailyMinutes" IS NOT NULL,
    'startMinutes', 1080,
    'repeatMinutes', "quotaReminderIntervalMinutes"
  ),
  'weekly', jsonb_build_object(
    'enabled', "quotaReminderEnabled" AND "quotaWeeklyMinutes" IS NOT NULL,
    'weekday', (("quotaWeekStartsOn" + 6) % 7),
    'startMinutes', 1080,
    'repeatMinutes', "quotaReminderIntervalMinutes"
  ),
  'monthly', jsonb_build_object(
    'enabled', "quotaReminderEnabled" AND ("quotaMonthlyDays" IS NOT NULL OR "quotaMonthlyMinutes" IS NOT NULL),
    'dayOfMonth', 0,
    'startMinutes', 1080,
    'repeatMinutes', "quotaReminderIntervalMinutes"
  )
);
