CREATE TABLE `bet_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`token_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`ask` text NOT NULL,
	`games` integer NOT NULL,
	`picks` integer NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bet_requests_viewer_idx` ON `bet_requests` (`viewer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trend_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`rank` integer NOT NULL,
	`market_ticker` text NOT NULL,
	`side` text NOT NULL,
	`market_kind` text NOT NULL,
	`title` text NOT NULL,
	`game_label` text NOT NULL,
	`league` text NOT NULL,
	`game_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`price` real NOT NULL,
	`fair` real NOT NULL,
	`trend_chance` real NOT NULL,
	`edge` real NOT NULL,
	`placed_at` text,
	`placed_via` text,
	`placed_contracts` real,
	`placed_cost` real,
	`pnl` real,
	`result` text,
	`settled_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `bet_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trend_picks_viewer_idx` ON `trend_picks` (`viewer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `trend_picks_market_idx` ON `trend_picks` (`market_ticker`,`side`);