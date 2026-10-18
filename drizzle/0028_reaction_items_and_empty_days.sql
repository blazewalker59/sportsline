CREATE TABLE `empty_days` (
	`league` text NOT NULL,
	`sports_day` text NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`league`, `sports_day`)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`item_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`item_id`, `viewer_id`),
	FOREIGN KEY (`item_id`) REFERENCES `timeline_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Reactions on items that no longer exist (or never did) are dropped: the
-- new foreign key would reject them.
INSERT INTO `__new_reactions`("item_id", "viewer_id", "emoji", "created_at") SELECT "item_id", "viewer_id", "emoji", "created_at" FROM `reactions` WHERE "item_id" IN (SELECT "id" FROM `timeline_items`) AND "viewer_id" IN (SELECT "id" FROM `user`);--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reactions_viewer_time_idx` ON `reactions` (`viewer_id`,`created_at`);