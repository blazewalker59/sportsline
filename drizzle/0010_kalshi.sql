CREATE TABLE `kalshi_accounts` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_type` text NOT NULL,
	`key_ciphertext` text NOT NULL,
	`key_iv` text NOT NULL,
	`scopes` text NOT NULL,
	`status` text NOT NULL,
	`last_error` text,
	`connected_at` text NOT NULL,
	`synced_at` text,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `kalshi_events` (
	`event_ticker` text PRIMARY KEY NOT NULL,
	`milestone_id` text,
	`league` text,
	`starts_at` text,
	`home_name` text,
	`away_name` text,
	`game_id` text,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kalshi_markets` (
	`ticker` text PRIMARY KEY NOT NULL,
	`event_ticker` text NOT NULL,
	`title` text NOT NULL,
	`yes_bid` real,
	`yes_ask` real,
	`last_price` real,
	`status` text,
	`result` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kalshi_prices` (
	`ticker` text NOT NULL,
	`at` text NOT NULL,
	`chance` real NOT NULL,
	PRIMARY KEY(`ticker`, `at`)
);
--> statement-breakpoint
CREATE TABLE `kalshi_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`league` text
);
--> statement-breakpoint
CREATE TABLE `prediction_legs` (
	`prediction_id` text NOT NULL,
	`position` integer NOT NULL,
	`market_ticker` text NOT NULL,
	`event_ticker` text NOT NULL,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`game_id` text,
	`team_id` text,
	`player_id` text,
	PRIMARY KEY(`prediction_id`, `position`),
	FOREIGN KEY (`prediction_id`) REFERENCES `predictions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prediction_legs_game_idx` ON `prediction_legs` (`game_id`);--> statement-breakpoint
CREATE INDEX `prediction_legs_market_idx` ON `prediction_legs` (`market_ticker`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`market_ticker` text NOT NULL,
	`kind` text NOT NULL,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`contracts` real NOT NULL,
	`cost` real NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`payout` real,
	`pnl` real,
	`opened_at` text NOT NULL,
	`settled_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `predictions_viewer_idx` ON `predictions` (`viewer_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_viewer_market_uq` ON `predictions` (`viewer_id`,`market_ticker`);