ALTER TABLE `projects` ADD `source` text DEFAULT 'manuel' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `needs_review` integer DEFAULT false NOT NULL;