CREATE TABLE `espn_accounts` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`swid_ciphertext` text NOT NULL,
	`swid_iv` text NOT NULL,
	`s2_ciphertext` text NOT NULL,
	`s2_iv` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`connected_at` text NOT NULL,
	`synced_at` text,
	`discovered_at` text,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fantasy_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`sport` text NOT NULL,
	`league_id` text NOT NULL,
	`season` integer NOT NULL,
	`team_id` integer,
	`name` text NOT NULL,
	`team_name` text,
	`enabled` integer DEFAULT true NOT NULL,
	`matchup` text,
	`last_error` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fantasy_leagues_viewer_idx` ON `fantasy_leagues` (`viewer_id`);--> statement-breakpoint
CREATE TABLE `fantasy_players` (
	`league_row_id` text NOT NULL,
	`espn_id` integer NOT NULL,
	`side` text NOT NULL,
	`player_id` text,
	`starter` integer NOT NULL,
	PRIMARY KEY(`league_row_id`, `espn_id`, `side`),
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fantasy_players_player_idx` ON `fantasy_players` (`player_id`);