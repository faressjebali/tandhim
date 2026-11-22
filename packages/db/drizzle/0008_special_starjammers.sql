CREATE TABLE `dossiers_drive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` text NOT NULL,
	`account_id` integer,
	`nom` text,
	`subject_id` integer,
	`last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dossiers_drive_folder_id_unique` ON `dossiers_drive` (`folder_id`);