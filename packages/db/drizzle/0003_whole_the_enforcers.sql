CREATE TABLE `ai_usage` (
	`day` text NOT NULL,
	`model` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_jour_modele` ON `ai_usage` (`day`,`model`);--> statement-breakpoint
CREATE TABLE `item_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`source_item_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `item_sources` (
	`item_id` integer NOT NULL,
	`source_item_id` integer NOT NULL,
	`role` text NOT NULL,
	`quote` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_sources_lien` ON `item_sources` (`item_id`,`source_item_id`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`account_id` integer,
	`external_id` text NOT NULL,
	`thread_id` text,
	`direction` text DEFAULT 'recu' NOT NULL,
	`sender` text,
	`recipients` text,
	`title` text,
	`body` text,
	`sent_at` text NOT NULL,
	`link` text,
	`attachments` text DEFAULT '[]' NOT NULL,
	`subject_hint_id` integer,
	`status` text DEFAULT 'a_traiter' NOT NULL,
	`pertinent` integer,
	`analysis` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_hint_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_source_externe` ON `source_items` (`source`,`external_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `how_mode` text;--> statement-breakpoint
ALTER TABLE `items` ADD `how_to` text;