#!/bin/bash
set -euo pipefail
umask 077
staging=$(mktemp -d)
verify_db="geo_workbench_backup_verify_$(date +%s)_$$"
created=0
trap 'if [ "$created" = 1 ]; then runuser -u postgres -- dropdb --if-exists "$verify_db"; fi; rm -rf "$staging"' EXIT
archive=$(find /srv/geo-workbench/shared/backups -maxdepth 1 -type f -name 'geo-workbench-*.tar' | sort | tail -1)
tar -xf "$archive" -C "$staging"
runuser -u postgres -- createdb "$verify_db"
created=1
chown postgres:postgres "$staging" "$staging/database.dump"
runuser -u postgres -- pg_restore --exit-on-error --no-owner --dbname "$verify_db" "$staging/database.dump"
runuser -u postgres -- psql -d "$verify_db" -At -c 'SELECT (SELECT count(*) FROM platform_configs), (SELECT count(*) FROM users), (SELECT count(*) FROM projects);'
tar -tzf "$staging/media.tar.gz" >/dev/null
printf 'BACKUP_RESTORE_VERIFIED\n'
