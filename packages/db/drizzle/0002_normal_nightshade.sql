CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`label` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`scopes` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `classroom_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`google_id` text NOT NULL,
	`name` text NOT NULL,
	`section` text,
	`link` text,
	`subject_id` integer,
	`followed` integer DEFAULT false NOT NULL,
	`suggested` integer DEFAULT true NOT NULL,
	`last_seen_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classroom_courses_compte_cours` ON `classroom_courses` (`account_id`,`google_id`);--> statement-breakpoint
CREATE TABLE `classroom_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`google_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`text` text,
	`link` text,
	`posted_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `classroom_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classroom_posts_cours_post` ON `classroom_posts` (`course_id`,`google_id`);--> statement-breakpoint
CREATE TABLE `sync_status` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`last_success_at` text,
	`last_error_at` text,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`next_retry_at` text,
	`details` text
);
--> statement-breakpoint
ALTER TABLE `items` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `items` ADD `account_id` integer REFERENCES accounts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `items_source_externe` ON `items` (`source`,`external_id`);