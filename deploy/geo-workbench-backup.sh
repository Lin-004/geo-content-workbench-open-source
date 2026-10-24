#!/bin/bash
set -euo pipefail
umask 077
exec 9>/run/lock/geo-workbench-backup.lock
flock -n 9 || exit 0
base=/srv/geo-workbench/shared/backups
mkdir -p "$base"
staging=$(mktemp -d "$base/.backup-XXXXXX")
trap 'rm -rf "$staging"' EXIT
runuser -u postgres -- pg_dump --format=custom geo_workbench > "$staging/database.dump"
tar -C /srv/geo-workbench/shared -czf "$staging/media.tar.gz" media
name="geo-workbench-$(date -u +%Y%m%dT%H%M%SZ).tar"
tar -C "$staging" -cf "$base/$name.tmp" database.dump media.tar.gz
mv "$base/$name.tmp" "$base/$name"
find "$base" -maxdepth 1 -type f -name 'geo-workbench-*.tar' -mtime +14 -delete
