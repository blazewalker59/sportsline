-- Predictions were dated by their settlement when Kalshi's fills couldn't be
-- read; clear the dates so the next syncs read them from the fills.
UPDATE `predictions` SET `traded_at` = NULL;
