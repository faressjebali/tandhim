#!/usr/bin/env bash
# Restaure la base du serveur depuis une sauvegarde quotidienne (docs/serveur.md §13).
#
#   pnpm restaurer:serveur                       → liste les sauvegardes et ESSAIE la plus récente
#   pnpm restaurer:serveur 2026-11-21            → ESSAIE celle du 21/11 (rien n'est modifié)
#   pnpm restaurer:serveur 2026-11-21 --confirmer → restaure vraiment (la base actuelle est gardée
#                                                  dans backups/avant-restauration-….db)
set -euo pipefail
SERVEUR="${SERVEUR:-user@server}"
DATE="${1:-}"
CONFIRMER="${2:-}"
if [[ -n "$DATE" && ! "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "✖ Date attendue au format AAAA-MM-JJ (ex. 2026-11-21)." >&2
  exit 1
fi

# SSH perd les arguments vides : « _ » tient lieu de « rien ».
ssh -o BatchMode=yes "$SERVEUR" bash -s -- "${DATE:-_}" "${CONFIRMER:-_}" <<'DISTANT'
set -euo pipefail
DATE="${1#_}"; CONFIRMER="${2#_}"
cd ~/tandhim/infra
W=tandhim-worker-1

echo "Sauvegardes disponibles :"
docker exec "$W" sh -c 'ls -1 /data/backups | grep -v -- "-wal$\|-shm$" | sed "s/^/  /"'
if [[ -z "$DATE" ]]; then
  FICHIER="$(docker exec "$W" sh -c 'ls -1 /data/backups/tandhim-*.db | sort | tail -1')"
else
  FICHIER="/data/backups/tandhim-$DATE.db"
fi
docker exec "$W" test -f "$FICHIER" || { echo "✖ $FICHIER introuvable." >&2; exit 1; }

# Vérification (lecture seule) : intégrité et contenu, comparés à la base actuelle.
docker exec -w /repo/packages/db "$W" node -e '
  const D = require("better-sqlite3");
  const voir = (f) => {
    const d = new D(f, { readonly: true, fileMustExist: true });
    const existe = (t) => !!d.prepare("select 1 from sqlite_master where type = ? and name = ?").get("table", t);
    const n = (t) => (existe(t) ? d.prepare(`select count(*) n from ${t}`).get().n : 0);
    const r = { integrite: d.pragma("integrity_check", { simple: true }), taches: n("items"), messages: n("source_items"), changements: n("changements_seance") };
    d.close();
    return r;
  };
  const s = voir(process.argv[1]);
  const a = voir("/data/tandhim.db");
  console.log(`Sauvegarde ${process.argv[1]} : intégrité ${s.integrite}, ${s.taches} tâche(s), ${s.messages} message(s), ${s.changements} changement(s) de séance`);
  console.log(`Base actuelle : ${a.taches} tâche(s), ${a.messages} message(s), ${a.changements} changement(s) de séance`);
  if (s.integrite !== "ok") { console.error("✖ Sauvegarde abîmée : restauration refusée."); process.exit(1); }
' "$FICHIER"

if [[ "$CONFIRMER" != "--confirmer" ]]; then
  echo "✔ Essai réussi : la sauvegarde est utilisable. Rien n'a été modifié."
  echo "  Pour restaurer vraiment : pnpm restaurer:serveur ${DATE:-$(basename "$FICHIER" .db | sed 's/tandhim-//')} --confirmer"
  exit 0
fi

# Restauration : copie de sécurité de la base actuelle, arrêt, remplacement, redémarrage.
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
docker exec -w /repo/packages/db "$W" node -e '
  const D = require("better-sqlite3");
  new D("/data/tandhim.db").backup(process.argv[1]).then(() => console.log("Base actuelle gardée :", process.argv[1]));
' "/data/backups/avant-restauration-$HORODATAGE.db"
IMAGE="$(docker inspect "$W" --format '{{.Config.Image}}')"
docker compose stop web worker
docker run --rm -v tandhim_app-data:/data --entrypoint sh "$IMAGE" -c \
  "cp '$FICHIER' /data/tandhim.db && rm -f /data/tandhim.db-wal /data/tandhim.db-shm"
docker compose start worker web
echo "✔ Base restaurée depuis $FICHIER. Les synchros reprendront au prochain passage."
DISTANT
