#!/usr/bin/env bash
# Одноразове налаштування Raspberry Pi під hryah. Запускається від root.
#
#   sudo REPO=owner/hryah RUNNER_URL=<arm64 tarball> RUNNER_TOKEN=<reg token> bash pi-bootstrap.sh
#
# Що робить:
#   1. ставить Caddy (гра на :80, екран статусу на :8087)
#   2. створює користувача hryah (без sudo, без пароля)
#   3. готує /srv/hryah/{releases,main,experimental}, /srv/hryah-status
#   4. ставить hryah-activate у /usr/local/bin
#   5. реєструє GitHub self-hosted runner (label hryah-pi) як systemd-сервіс під hryah
#
# Чого НЕ чіпає: K3s і под tgbot, omnihub (:8086), runner репозиторію tenzo, порти не з цього списку.
set -euo pipefail
cd "$(dirname "$0")"

[ "$(id -u)" = 0 ] || { echo "запусти від root (sudo)" >&2; exit 1; }
: "${REPO:?REPO=owner/name}"

echo "==> перевірка зайнятих портів"
for p in 80 8087; do
  if ss -ltnH "sport = :$p" | grep -q .; then
    if ! ss -ltnpH "sport = :$p" | grep -q caddy; then
      echo "порт $p зайнятий не Caddy — зупиняюсь" >&2; ss -ltnpH "sport = :$p" >&2; exit 1
    fi
  fi
done

echo "==> пакети"
apt-get update -qq
apt-get install -y -qq caddy rsync curl >/dev/null

echo "==> користувач hryah"
if ! id hryah &>/dev/null; then
  useradd --create-home --shell /bin/bash hryah
  passwd -l hryah >/dev/null
fi

echo "==> /srv/hryah"
install -d -o hryah -g hryah /srv/hryah /srv/hryah/releases/main /srv/hryah/releases/experimental /srv/hryah-status
for ch in main experimental; do
  if [ ! -e "/srv/hryah/$ch" ]; then
    d="/srv/hryah/releases/$ch/000-placeholder"
    install -d -o hryah -g hryah "$d"
    cat > "$d/index.html" <<EOF
<!doctype html><meta charset=utf-8><title>hryah</title>
<body style="font-family:sans-serif;background:#0b0d17;color:#e6e6e6;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1>🚀 hryah · $ch</h1><p>Чекаємо на перший деплой…</p></div>
EOF
    chown hryah:hryah "$d/index.html"
    sudo -u hryah ln -sfn "$d" "/srv/hryah/$ch"
  fi
done
install -m 644 -o hryah -g hryah status/index.html /srv/hryah-status/index.html
[ -f /srv/hryah-status/status.json ] || echo '{"updated":0,"repo":"","channels":{},"prs":[],"runs":[]}' | install -m 644 -o hryah -g hryah /dev/stdin /srv/hryah-status/status.json

echo "==> hryah-activate"
install -m 755 hryah-activate /usr/local/bin/hryah-activate

echo "==> Caddy"
install -d -o caddy -g caddy /var/log/caddy
[ -f /etc/caddy/Caddyfile ] && cp -n /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-before-hryah || true
install -m 644 Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable --now caddy
systemctl reload caddy

if [ -n "${RUNNER_TOKEN:-}" ] && [ -n "${RUNNER_URL:-}" ]; then
  echo "==> GitHub runner (hryah-pi)"
  RDIR=/home/hryah/actions-runner
  if [ ! -x "$RDIR/run.sh" ]; then
    install -d -o hryah -g hryah "$RDIR"
    curl -fsSL "$RUNNER_URL" | sudo -u hryah tar xz -C "$RDIR"
  fi
  if [ ! -f "$RDIR/.runner" ]; then
    sudo -u hryah "$RDIR/config.sh" --unattended --replace \
      --url "https://github.com/$REPO" --token "$RUNNER_TOKEN" \
      --name pi4-hryah --labels hryah-pi --work _work
  fi
  (cd "$RDIR" && ./svc.sh install hryah && ./svc.sh start) || (cd "$RDIR" && ./svc.sh status)
else
  echo "==> RUNNER_TOKEN/RUNNER_URL не задано — runner пропущено"
fi

echo "==> перевірка"
curl -fsS -o /dev/null -w "main:         %{http_code}\n" http://127.0.0.1/
curl -fsS -o /dev/null -w "experimental: %{http_code}\n" http://127.0.0.1/experimental/
curl -fsS -o /dev/null -w "status:       %{http_code}\n" http://127.0.0.1:8087/
echo "--- чужі сервіси (мають бути як були)"
systemctl is-active k3s omnihub 2>/dev/null | paste -sd' '
echo "ok"
