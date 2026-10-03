CREATE TABLE `league_settings` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`league_order` text NOT NULL,
	`hidden_leagues` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
