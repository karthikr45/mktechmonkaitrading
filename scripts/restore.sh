#!/usr/bin/env bash
set -euo pipefail
node scripts/database-tools.mjs restore "${1:?Pass the backup path}"
