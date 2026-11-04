-- ============================================================================
-- Lumiscia / English Quiz Platform
-- Migration: archive_legacy_schemas.sql
-- Description: Safe retirement and decommissioning of 60 unused legacy schema
--              tables identified during Zero-Compression Forensic Code Audit [DEAD_SCHEMA].
--
-- Safety Invariant:
-- All active runtime application queries operate exclusively on normalized
-- production tables (users, class_groups, class_group_students, catalog_documents,
-- user_feedback, user_cards, user_state, etc.).
-- The 60 tables below contain 0 SELECT / INSERT / UPDATE / DELETE statements
-- across all codebase backend workers and client modules.
--
-- Execution Precondition:
-- Ensure a point-in-time snapshot / backup of the D1 database is taken
-- before executing this script:
--   npx wrangler d1 export <DATABASE_NAME> --output backup_pre_cleanup.sql
-- ============================================================================

-- Phase 1: Legacy v6 schemas
DROP TABLE IF EXISTS card_progress_v6;
DROP TABLE IF EXISTS card_quiz_collections_v6;
DROP TABLE IF EXISTS cards_v6;
DROP TABLE IF EXISTS class_group_lessons_v6;
DROP TABLE IF EXISTS class_groups_v6;
DROP TABLE IF EXISTS exam_blocks_v6;
DROP TABLE IF EXISTS exam_materials_v6;
DROP TABLE IF EXISTS exam_work_v6;
DROP TABLE IF EXISTS exams_v6;
DROP TABLE IF EXISTS lesson_access_v6;
DROP TABLE IF EXISTS lesson_blocks_v6;
DROP TABLE IF EXISTS lesson_responses_v6;
DROP TABLE IF EXISTS lessons_v6;
DROP TABLE IF EXISTS library_items_v6;
DROP TABLE IF EXISTS profile_cards_v6;
DROP TABLE IF EXISTS profile_library_items_v6;
DROP TABLE IF EXISTS profile_members_v6;
DROP TABLE IF EXISTS profile_settings_v6;
DROP TABLE IF EXISTS quiz_collections_v6;
DROP TABLE IF EXISTS quiz_progress_v6;
DROP TABLE IF EXISTS quizzes_v6;
DROP TABLE IF EXISTS study_profiles_v6;

-- Phase 2: Legacy v9 schemas
DROP TABLE IF EXISTS account_archives_v9;
DROP TABLE IF EXISTS account_error_items_v9;
DROP TABLE IF EXISTS account_refs_v9;
DROP TABLE IF EXISTS account_settings_v9;
DROP TABLE IF EXISTS assessment_history_v9;
DROP TABLE IF EXISTS assessment_recordings_v9;
DROP TABLE IF EXISTS assessment_work_v9;
DROP TABLE IF EXISTS chat_assignments_v9;
DROP TABLE IF EXISTS chat_mutations_v9;
DROP TABLE IF EXISTS chat_send_budget_v9;
DROP TABLE IF EXISTS class_group_students_v9;
DROP TABLE IF EXISTS content_archive_v9;
DROP TABLE IF EXISTS exam_instances_v9;
DROP TABLE IF EXISTS exam_reviewer_hides_v9;
DROP TABLE IF EXISTS exam_work_v9;
DROP TABLE IF EXISTS lesson_access_v9;
DROP TABLE IF EXISTS operation_receipts_v9;
DROP TABLE IF EXISTS profile_members_v9;
DROP TABLE IF EXISTS qr_feedback_v9;
DROP TABLE IF EXISTS qr_media_v9;
DROP TABLE IF EXISTS qr_speech_attempts_v9;
DROP TABLE IF EXISTS security_sessions_v9;
DROP TABLE IF EXISTS speakout_answers_v9;

-- Phase 3: Legacy intermediate migration staging tables
DROP TABLE IF EXISTS account_changes_new;
DROP TABLE IF EXISTS entity_json_progress;
DROP TABLE IF EXISTS legacy_account_change_ids;
DROP TABLE IF EXISTS legacy_registration_ids;
DROP TABLE IF EXISTS migration_issues;
DROP TABLE IF EXISTS migration_runs;
DROP TABLE IF EXISTS migration_sources;
DROP TABLE IF EXISTS qr_speech_tasks_expanded;
DROP TABLE IF EXISTS registrations_new;
DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS sessions_new;
DROP TABLE IF EXISTS user_added_new;
DROP TABLE IF EXISTS user_card_gone_new;
DROP TABLE IF EXISTS user_state_new;
DROP TABLE IF EXISTS users_new;
