#!/usr/bin/env bash
# Run as root on Ubuntu 24.04 with the app copied to /opt/headwind and /etc/headwind/env in place.
set -euo pipefail
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs build-essential
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi
id headwind >/dev/null 2>&1 || useradd --system --home /var/lib/headwind --create-home headwind
mkdir -p /var/lib/headwind
chown -R headwind:headwind /opt/headwind /var/lib/headwind
chmod 640 /etc/headwind/env && chgrp headwind /etc/headwind/env
sudo -u headwind bash -c "cd /opt/headwind && npm ci && npm run build"
cp /opt/headwind/deploy/Caddyfile /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/headwind/caddy.env\n' > /etc/systemd/system/caddy.service.d/headwind.conf
cp /opt/headwind/deploy/headwind-*.service /opt/headwind/deploy/headwind-weekly.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now headwind-web headwind-worker headwind-weekly.timer
systemctl restart headwind-web headwind-worker caddy
