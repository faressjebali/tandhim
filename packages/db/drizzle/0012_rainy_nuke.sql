CREATE TABLE `consignes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`source_item_id` integer,
	`niveau` text NOT NULL,
	`aspects` text DEFAULT '[]' NOT NULL,
	`texte` text NOT NULL,
	`date_info` text NOT NULL,
	`remplacee` integer DEFAULT false NOT NULL,
	`a_verifier` integer DEFAULT false NOT NULL,
	`echeance_proposee` text,
	`vue` integer DEFAULT true NOT NULL,
	`notifier` integer DEFAULT false NOT NULL,
	`notifiee_le` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `items` ADD `niveau_echeance` text DEFAULT 'ecrit' NOT NULL;--> statement-breakpoint
-- Reprise de l'existant : le « comment faire » de chaque tâche devient sa première consigne.
INSERT INTO `consignes` (`item_id`, `source_item_id`, `niveau`, `aspects`, `texte`, `date_info`)
SELECT i.`id`,
  (SELECT x.`source_item_id` FROM `item_sources` x WHERE x.`item_id` = i.`id` AND x.`role` = 'creation' LIMIT 1),
  CASE WHEN i.`locked_by_user` = 1 THEN 'fares'
       WHEN EXISTS (SELECT 1 FROM `item_sources` x JOIN `source_items` s ON s.`id` = x.`source_item_id`
                    WHERE x.`item_id` = i.`id` AND x.`role` = 'creation' AND s.`source` = 'messenger') THEN 'messenger'
       ELSE 'ecrit' END,
  '["contenu"]', i.`how_to`, i.`created_at`
FROM `items` i WHERE i.`how_to` IS NOT NULL AND trim(i.`how_to`) <> '';
--> statement-breakpoint
UPDATE `items` SET `niveau_echeance` = 'fares' WHERE `locked_by_user` = 1;
--> statement-breakpoint
UPDATE `items` SET `niveau_echeance` = 'messenger' WHERE `locked_by_user` = 0 AND EXISTS (
  SELECT 1 FROM `item_sources` x JOIN `source_items` s ON s.`id` = x.`source_item_id`
  WHERE x.`item_id` = `items`.`id` AND x.`role` = 'creation' AND s.`source` = 'messenger');
