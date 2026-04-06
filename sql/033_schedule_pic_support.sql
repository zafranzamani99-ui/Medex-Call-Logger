-- 033: Add PIC Support field to schedules
-- WHY: The person who logs the schedule may not be the one doing the support.
-- pic = clinic contact person, pic_support = Medex support agent assigned to handle it.

ALTER TABLE schedules ADD COLUMN pic_support TEXT;
