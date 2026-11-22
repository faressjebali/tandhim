CREATE TABLE `academic_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'confirme' NOT NULL,
	`blocks_classes` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'seed' NOT NULL,
	`locked_by_user` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_events_natural` ON `academic_events` (`kind`,`title`,`start_date`);--> statement-breakpoint
CREATE TABLE `academic_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`semester_id` integer NOT NULL,
	`number` integer NOT NULL,
	`letter` text NOT NULL,
	`start_date` text NOT NULL,
	FOREIGN KEY (`semester_id`) REFERENCES `semesters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_weeks_start_date_unique` ON `academic_weeks` (`start_date`);--> statement-breakpoint
CREATE TABLE `semesters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`academic_year` text NOT NULL,
	`number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semesters_year_number` ON `semesters` (`academic_year`,`number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`teacher` text,
	`color` text NOT NULL,
	`submissions_via_classroom` integer DEFAULT false NOT NULL,
	`notes` text,
	`locked_by_user` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_code_unique` ON `subjects` (`code`);--> statement-breakpoint
CREATE TABLE `timetable_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timetable_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`slot` text NOT NULL,
	`subject_id` integer NOT NULL,
	`type` text NOT NULL,
	`room` text NOT NULL,
	`teacher` text NOT NULL,
	`weeks` text DEFAULT 'all' NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`timetable_id`) REFERENCES `timetables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_slots_natural` ON `timetable_slots` (`timetable_id`,`day_of_week`,`slot`,`weeks`);--> statement-breakpoint
CREATE TABLE `timetables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL,
	`source_file` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetables_label_unique` ON `timetables` (`label`);