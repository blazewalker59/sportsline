CREATE TABLE `follows` (
	`viewer_id` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`viewer_id`, `kind`, `target`),
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `read_markers` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`read_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `players` ADD `team_id` text;--> statement-breakpoint
ALTER TABLE `players` ADD `position` text;