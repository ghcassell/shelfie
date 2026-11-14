CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
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
CREATE TABLE `household_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`warning_days` integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`display_name` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`size` text,
	`category` text,
	`image_url` text,
	`barcode` text,
	`base_unit` text DEFAULT 'count' NOT NULL,
	`pack_amount` real DEFAULT 1 NOT NULL,
	`opened_shelf_life_days` integer,
	`warning_days` integer,
	`low_threshold` real,
	`low_threshold_unit` text DEFAULT 'base' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipt_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`alias` text NOT NULL,
	`product_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`deleted_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`product_id` text,
	`quantity` text,
	`added_by` text NOT NULL,
	`ticked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`cursor` text
);
--> statement-breakpoint
CREATE TABLE `usage_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`updated_at` text,
	`dirty` integer DEFAULT 0 NOT NULL,
	`batch_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	`waste_reason` text,
	`reverses_entry_id` text,
	`split_batch_id` text
);
