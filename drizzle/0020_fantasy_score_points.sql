CREATE TABLE `fantasy_score_points` (
	`league_row_id` text NOT NULL,
	`at` text NOT NULL,
	`matchup_period` integer NOT NULL,
	`mine` real NOT NULL,
	`opponent` real NOT NULL,
	PRIMARY KEY(`league_row_id`, `at`),
	FOREIGN KEY (`league_row_id`) REFERENCES `fantasy_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
