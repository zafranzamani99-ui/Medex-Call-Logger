-- 045: Add 'Hardware' to issue_category options
-- WHY: Hardware is a parent classification (category), not an issue type.
-- No DB constraint exists for issue_category — this is just documentation.
-- The ISSUE_CATEGORIES array in lib/constants.ts is the source of truth.

-- Nothing to run — issue_category has no CHECK constraint in the DB.
-- Hardware was added to ISSUE_CATEGORIES in lib/constants.ts.
