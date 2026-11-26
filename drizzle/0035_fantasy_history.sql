CREATE TABLE `fantasy_history` (
	`league_row_id` text NOT NULL,
	`season` integer NOT NULL,
	`data` text NOT NULL,
	`complete` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`league_row_id`, `season`),
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
