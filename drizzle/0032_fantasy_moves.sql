CREATE TABLE `fantasy_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`league_row_id` text NOT NULL,
	`kind` text NOT NULL,
	`add` text,
	`drop` text,
	`bid` integer,
	`status` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fantasy_moves_viewer_idx` ON `fantasy_moves` (`viewer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `fantasy_moves_league_idx` ON `fantasy_moves` (`league_row_id`,`status`);--> statement-breakpoint
ALTER TABLE `espn_accounts` ADD `moves_enabled` integer DEFAULT false NOT NULL;