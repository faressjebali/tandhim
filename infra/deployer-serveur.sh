#!/usr/bin/env bash
# Déploie Tandhim sur le serveur sans rien construire là-bas :
#   1. vérifie que le code est commité et poussé (le serveur récupère infra/ via git) ;
#   2. construit les images sur ce PC ;
#   3. les envoie directement au serveur par SSH (aucun registre, aucun jeton) ;
#   4. sur le serveur : git pull, redémarrage, vérification de santé, nettoyage.
#
# Usage : pnpm deploy:serveur            (serveur par défaut : user@server)
#         SERVEUR=user@<adresse-ip-du-serveur> pnpm deploy:serveur
set -euo pipefail

SERVEUR="${SERVEUR:-user@server}"
IMAGES=(tandhim-web tandhim-worker)
cd "$(dirname "$0")/.."

etape() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
echec() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

etape "Vérification du dépôt"
[[ -z "$(git status --porcelain)" ]] || echec "Des modifications ne sont pas commitées."
git fetch -q origin
[[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{u}')" ]] || echec "Le commit n'est pas poussé sur GitHub (git push)."
TAG="$(git rev-parse --short HEAD)"
echo "Version : $TAG"

etape "Construction des images (sur ce PC)"
TANDHIM_TAG="$TAG" docker compose -f infra/docker-compose.yml build

etape "Envoi des images au serveur ($SERVEUR)"
docker save "${IMAGES[@]/%/:$TAG}" | gzip -1 | ssh -o BatchMode=yes "$SERVEUR" 'gunzip | docker load -q'

etape "Mise à jour du serveur"
ssh -o BatchMode=yes "$SERVEUR" bash -s -- "$TAG" <<'DISTANT'
set -euo pipefail
TAG="$1"
cd ~/tandhim
git pull -q
for img in tandhim-web tandhim-worker; do docker tag "$img:$TAG" "$img:latest"; done
cd infra
docker compose up -d --no-build --remove-orphans
etat=""
for i in $(seq 1 40); do
  etat="$(docker inspect -f '{{.State.Health.Status}}' tandhim-web-1 2>/dev/null || true)"
  [[ "$etat" == healthy ]] && break
  sleep 3
done
docker compose ps --format '{{.Service}} {{.Status}}'
[[ "$etat" == healthy ]] || { echo "Le web n'est pas en bonne santé :"; docker compose logs --tail 30 web worker; exit 1; }
# Garde la version courante et la précédente (retour arrière possible), supprime le reste.
for img in tandhim-web tandhim-worker; do
  anciennes="$(docker images "$img" --format '{{.Tag}}' | grep -vE "^(latest|$TAG|<none>)$" | tail -n +2 || true)"
  for t in $anciennes; do docker rmi -f "$img:$t" >/dev/null; done
done
docker image prune -f >/dev/null
DISTANT

etape "Terminé ✅  version $TAG en ligne"
