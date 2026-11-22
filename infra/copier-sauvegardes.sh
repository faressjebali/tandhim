#!/usr/bin/env bash
# Copie les sauvegardes du serveur sur ce PC (data/sauvegardes-serveur/), pour en avoir une
# copie ailleurs que sur le disque du serveur (docs/serveur.md §13). Jamais commitées (data/).
set -euo pipefail
SERVEUR="${SERVEUR:-user@server}"
cd "$(dirname "$0")/.."
DEST="data/sauvegardes-serveur"
mkdir -p "$DEST"

ssh -o BatchMode=yes "$SERVEUR" 'rm -rf /tmp/tandhim-sauvegardes && docker cp tandhim-worker-1:/data/backups /tmp/tandhim-sauvegardes'
scp -q -o BatchMode=yes "$SERVEUR:/tmp/tandhim-sauvegardes/tandhim-*.db" "$DEST/"
ssh -o BatchMode=yes "$SERVEUR" 'rm -rf /tmp/tandhim-sauvegardes'

# Sur ce PC aussi, on ne garde que les 30 plus récentes.
ls -1 "$DEST"/tandhim-*.db | sort | head -n -30 | xargs -r rm -f
echo "✔ Sauvegardes copiées dans $DEST :"
ls -1 "$DEST" | sed 's/^/  /'
