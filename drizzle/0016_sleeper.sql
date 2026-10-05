CREATE TABLE `sleeper_accounts` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`connected_at` text NOT NULL,
	`synced_at` text,
	`discovered_at` text,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `fantasy_leagues` ADD `provider` text DEFAULT 'espn' NOT NULL;