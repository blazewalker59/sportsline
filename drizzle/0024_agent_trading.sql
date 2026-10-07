CREATE TABLE `kalshi_trade_keys` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`key_id` text NOT NULL,
	`key_type` text NOT NULL,
	`key_ciphertext` text NOT NULL,
	`key_iv` text NOT NULL,
	`scopes` text NOT NULL,
	`max_order_dollars` real NOT NULL,
	`max_daily_dollars` real NOT NULL,
	`connected_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`token_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`market_ticker` text NOT NULL,
	`market_title` text NOT NULL,
	`side` text NOT NULL,
	`action` text NOT NULL,
	`count` integer NOT NULL,
	`limit_cents` integer NOT NULL,
	`max_cost_dollars` real NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`decided_at` text,
	`approved_day` text,
	`order_id` text,
	`filled_count` real,
	`avg_price_dollars` real,
	`fees_dollars` real,
	`error` text,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trade_proposals_viewer_idx` ON `trade_proposals` (`viewer_id`,`created_at`);