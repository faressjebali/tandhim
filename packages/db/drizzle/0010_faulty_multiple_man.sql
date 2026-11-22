CREATE TABLE `sondages_messenger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`salon` text NOT NULL,
	`event_id` text NOT NULL,
	`auteur` text NOT NULL,
	`cree_le` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`votes` text DEFAULT '{}' NOT NULL,
	`clos` integer DEFAULT false NOT NULL,
	`signature_envoyee` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sondages_messenger_event_id_unique` ON `sondages_messenger` (`event_id`);