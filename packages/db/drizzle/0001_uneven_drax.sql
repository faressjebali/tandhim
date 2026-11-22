CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text DEFAULT 'tache' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`subject_id` integer,
	`project_id` integer,
	`due_at` text,
	`due_all_day` integer DEFAULT true NOT NULL,
	`importance` text DEFAULT 'normale' NOT NULL,
	`status` text DEFAULT 'a_faire' NOT NULL,
	`completed_at` text,
	`source` text DEFAULT 'manuel' NOT NULL,
	`source_url` text,
	`confidence` integer,
	`needs_review` integer DEFAULT false NOT NULL,
	`locked_by_user` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer,
	`description` text,
	`deadline_date` text,
	`color` text,
	`status` text DEFAULT 'en_cours' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
