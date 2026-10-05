CREATE TABLE `error_events` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`message` text NOT NULL,
	`count` integer NOT NULL,
	`first_at` text NOT NULL,
	`last_at` text NOT NULL,
	`context` text,
	`notified_at` text
);
--> statement-breakpoint
CREATE TABLE `job_runs` (
	`name` text PRIMARY KEY NOT NULL,
	`every_ms` integer NOT NULL,
	`last_started_at` text,
	`last_ok_at` text,
	`last_error_at` text,
	`last_error` text,
	`last_duration_ms` integer,
	`runs` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL
);
