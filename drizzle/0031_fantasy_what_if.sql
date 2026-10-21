CREATE TABLE `fantasy_what_if` (
	`league_row_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`matchups` text NOT NULL,
	`final` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`league_row_id`, `season`, `week`),
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
