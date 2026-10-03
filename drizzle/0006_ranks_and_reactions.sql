CREATE TABLE `reactions` (
	`item_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`item_id`, `viewer_id`),
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `games` ADD `away_rank` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `home_rank` integer;