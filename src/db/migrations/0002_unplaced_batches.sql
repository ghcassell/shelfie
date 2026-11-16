PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text,
	`starting_amount` real NOT NULL,
	`pack_count` integer DEFAULT 1 NOT NULL,
	`expiry_date` text,
	`no_expiry` integer DEFAULT false NOT NULL,
	`date_kind` text DEFAULT 'best_before' NOT NULL,
	`opened_on` text,
	`price_pence` integer,
	`added_by` text NOT NULL,
	`added_at` text NOT NULL,
	`split_from_batch_id` text
);
--> statement-breakpoint
INSERT INTO `__new_batches`("id", "household_id", "updated_at", "deleted_at", "dirty", "product_id", "location_id", "starting_amount", "pack_count", "expiry_date", "no_expiry", "date_kind", "opened_on", "price_pence", "added_by", "added_at", "split_from_batch_id") SELECT "id", "household_id", "updated_at", "deleted_at", "dirty", "product_id", "location_id", "starting_amount", "pack_count", "expiry_date", "no_expiry", "date_kind", "opened_on", "price_pence", "added_by", "added_at", "split_from_batch_id" FROM `batches`;--> statement-breakpoint
DROP TABLE `batches`;--> statement-breakpoint
ALTER TABLE `__new_batches` RENAME TO `batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;