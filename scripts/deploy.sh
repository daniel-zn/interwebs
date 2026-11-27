#!/bin/sh
# Publishes the site to https://interwebs.danielzn.com from this Mac: mercurius-agent integrate's release runs it
# after a push to main. Cloudflare doesn't build this repository (no Workers Builds link).
set -eu
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund --loglevel=error
mercurius-agent secret run --env CLOUDFLARE_API_TOKEN -- npx wrangler deploy
