CREATE TABLE `cash_outs` (
	`id` text PRIMARY KEY NOT NULL,
	`viewer_id` text NOT NULL,
	`prediction_id` text NOT NULL,
	`market_ticker` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`side` text NOT NULL,
	`count` real NOT NULL,
	`method` text NOT NULL,
	`limit_cents` integer,
	`quote_price` real,
	`expected_dollars` real,
	`status` text NOT NULL,
	`rfq_id` text,
	`quote_id` text,
	`order_id` text,
	`filled_count` real,
	`avg_price_dollars` real,
	`fees_dollars` real,
	`error` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cash_outs_viewer_idx` ON `cash_outs` (`viewer_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `kalshi_events` ADD `series_ticker` text;