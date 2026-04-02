#!/usr/bin/env bash
# Create a Neon project and write the connection string to .env.
# Then run the seed script to create the first admin user.
#
# Usage:
#   bash scripts/setup-neon.sh              # uses folder name as project name
#   bash scripts/setup-neon.sh my-project   # custom project name
#
# Requires: npx neonctl (auth first: npx neonctl auth)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="${1:-$(basename "$PROJECT_DIR")}"

cd "$PROJECT_DIR"

# Check neonctl auth
echo "==> Checking neonctl auth..."
if ! npx -y neonctl projects list --output json > /dev/null 2>&1; then
    echo "ERROR: Not authenticated with Neon. Run:"
    echo "  npx neonctl auth"
    echo "Then re-run this script."
    exit 1
fi

# Create Neon project
echo "==> Creating Neon project: $PROJECT_NAME"
npx -y neonctl projects create --name "$PROJECT_NAME" --set-context
echo ""

# Get connection string
echo "==> Getting connection string..."
DB_URL=$(npx -y neonctl connection-string)
echo "    $DB_URL"

# Set up .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "==> Created .env from .env.example"
fi

# Write DATABASE_URL to .env
if grep -q "^DATABASE_URL=" .env; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" .env
else
    echo "DATABASE_URL=${DB_URL}" >> .env
fi
echo "==> DATABASE_URL written to .env"

# Seed admin user
echo ""
echo "==> Creating admin user..."
node scripts/seed.js

echo ""
echo "==> Setup complete!"
echo "    Project:  $PROJECT_NAME"
echo "    Database: $DB_URL"
echo "    Admin:    ${ADMIN_EMAIL:-admin@example.com} / ${ADMIN_PASSWORD:-admin}"
echo ""
echo "    Run 'npm run dev' to start the dev server."
echo "    Change the admin password after first login."
