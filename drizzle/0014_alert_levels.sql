CREATE TABLE `alert_marks` (
	`key` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alert_settings` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`following` text DEFAULT 'scores' NOT NULL,
	`predictions` text DEFAULT 'key' NOT NULL,
	`fantasy` text DEFAULT 'key' NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `predictions` ADD `alert_chance` real;