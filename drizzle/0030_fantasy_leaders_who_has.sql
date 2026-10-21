CREATE TABLE `who_has` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`league_row_id` text NOT NULL,
	`player` text NOT NULL,
	`status` text NOT NULL,
	`owner_team_id` integer NOT NULL,
	`options` text NOT NULL,
	`created_at` text NOT NULL,
	`answered_at` text,
	`guess_team_id` integer,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `who_has_viewer_idx` ON `who_has` (`viewer_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `fantasy_leagues` ADD `leaders` text;--> statement-breakpoint
ALTER TABLE `fantasy_leagues` ADD `rosters` text;