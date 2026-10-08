CREATE TABLE `viewer_settings` (
	`viewer_id` text PRIMARY KEY NOT NULL,
	`price_display` text DEFAULT 'cents' NOT NULL,
	FOREIGN KEY (`viewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
