ALTER TABLE `viewer_settings` ADD `first_run_done_at` text;--> statement-breakpoint
-- Viewers who already follow something are past the first run.
INSERT INTO `viewer_settings` (`viewer_id`, `first_run_done_at`)
SELECT DISTINCT `viewer_id`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM `follows` WHERE true
ON CONFLICT (`viewer_id`) DO UPDATE SET `first_run_done_at` = excluded.`first_run_done_at`;
