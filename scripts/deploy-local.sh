#!/usr/bin/env bash
# Deploy the committed HEAD to the local Docker stack (http://127.0.0.1:8090 by default).
# Steps: verify, tag rollback images, rebuild api and web, restart them, check health and start-up.
# If a check fails after the restart, the previous images come back automatically.
# MinIO and its volume are never touched. Canvases are never created or changed.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy-local: the working tree has changes. Commit or stash them; only committed code is deployed." >&2
  exit 1
fi

sha="$(git rev-parse --short HEAD)"
branch="$(git branch --show-current)"
echo "deploy-local: deploying $sha ($branch)"
if ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  echo "deploy-local: note: $sha is not on origin/main."
fi

verified_file="$(git rev-parse --git-dir)/canvas-verified"
if [ "${SKIP_VERIFY:-0}" = 1 ]; then
  echo "deploy-local: SKIP_VERIFY=1, skipping make verify"
elif [ -f "$verified_file" ] && [ "$(cat "$verified_file")" = "$(git rev-parse HEAD)" ]; then
  echo "deploy-local: $sha already passed make verify (pre-push hook)"
else
  make verify
  git rev-parse HEAD > "$verified_file"
fi

api_container="$(docker compose ps -q api)"
web_container="$(docker compose ps -q web)"
if [ -z "$api_container" ] || [ -z "$web_container" ]; then
  echo "deploy-local: the stack is not running. Start it once with make stack-up." >&2
  exit 1
fi
api_image="$(docker inspect -f '{{.Config.Image}}' "$api_container")"
web_image="$(docker inspect -f '{{.Config.Image}}' "$web_container")"
web_url="http://$(docker compose port web 80)"

stamp="$(date +%Y%m%d-%H%M%S)"
rollback="rollback-$stamp"
docker tag "$api_image:latest" "$api_image:$rollback"
docker tag "$web_image:latest" "$web_image:$rollback"
rollback_cmd="docker tag $api_image:$rollback $api_image:latest && docker tag $web_image:$rollback $web_image:latest && docker compose up -d --no-deps api web"
echo "deploy-local: tagged previous images as :$rollback"

docker compose build api web
docker tag "$api_image:latest" "$api_image:sha-$sha"
docker tag "$web_image:latest" "$web_image:sha-$sha"
docker compose up -d --no-deps api web

check() {
  local api status
  api="$(docker compose ps -q api)"
  for _ in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$api")"
    [ "$status" = healthy ] && break
    sleep 2
  done
  [ "$status" = healthy ] || { echo "api is $status"; return 1; }

  for _ in $(seq 1 15); do
    curl -fsS -o /dev/null "$web_url/" && break
    sleep 1
  done
  curl -fsS "$web_url/health" > /dev/null || { echo "$web_url/health failed"; return 1; }

  # Every script and stylesheet the page names must be served.
  local asset
  for asset in $(curl -fsS "$web_url/" | grep -oE '/assets/[^"]+\.(js|css)' | sort -u); do
    curl -fsS -o /dev/null "$web_url$asset" || { echo "missing $asset"; return 1; }
  done

  # The bundle must start: today's CI failure served every file and still crashed on load.
  node scripts/check-startup.mjs "$web_url"
}

if ! check; then
  echo "deploy-local: checks failed after the restart. Restoring the previous images." >&2
  eval "$rollback_cmd"
  exit 1
fi

echo "deploy-local: $sha is live at $web_url"
echo "deploy-local: to roll back:"
echo "  $rollback_cmd"
