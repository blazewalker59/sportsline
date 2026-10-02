CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`sports_day` text NOT NULL,
	`starts_at` text NOT NULL,
	`status` text NOT NULL,
	`away_team_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_score` integer DEFAULT 0 NOT NULL,
	`home_score` integer DEFAULT 0 NOT NULL,
	`situation` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_sports_day_idx` ON `games` (`sports_day`);--> statement-breakpoint
CREATE TABLE `item_players` (
	`item_id` text NOT NULL,
	`player_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `player_id`),
	FOREIGN KEY (`item_id`) REFERENCES `timeline_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_players_player_idx` ON `item_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_league_name_idx` ON `players` (`league`,`name`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `source_ids` (
	`entity` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`internal_id` text NOT NULL,
	PRIMARY KEY(`entity`, `source`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX `source_ids_internal_idx` ON `source_ids` (`internal_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`league` text NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`item_key` text NOT NULL,
	`league` text NOT NULL,
	`sports_day` text NOT NULL,
	`away_team_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`kind` text NOT NULL,
	`sequence` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`segment_label` text NOT NULL,
	`away_score` integer NOT NULL,
	`home_score` integer NOT NULL,
	`description` text NOT NULL,
	`play_type` text,
	`significance` text,
	`milestone` text,
	`status` text NOT NULL,
	`revised_at` text,
	`overturn_of` text,
	`players` text NOT NULL,
	`detail` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timeline_items_day_time_idx` ON `timeline_items` (`sports_day`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_items_game_key_uq` ON `timeline_items` (`game_id`,`item_key`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);