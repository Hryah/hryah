#!/usr/bin/env bash
# Одноразове підключення сервера кімнат консорціуму на Pi. Запускається від root, ідемпотентне.
#   sudo bash install-rooms.sh
# Ставить systemd-сервіси hryah-rooms@main (порт 8090) і hryah-rooms@experimental (порт 8091) від користувача hryah,
# додає в Caddy проксі /api/* і /experimental/api/*. Сам код сервера приїжджає в кожному релізі (dist/server/rooms.mjs),
# а сервіс сам перезапускається, коли активний реліз змінився. K3s, tgbot, omnihub і runner tenzo не чіпає.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "запусти від root (sudo)" >&2; exit 1; }
id hryah &>/dev/null || { echo "немає користувача hryah: спершу pi-bootstrap.sh" >&2; exit 1; }

echo "==> Node"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -qq && apt-get install -y -qq nodejs >/dev/null
fi
node -v
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "потрібен Node 20+" >&2; exit 1; }

echo "==> порти 8090/8091"
for p in 8090 8091; do
  if ss -ltnH "sport = :$p" | grep -q . && ! systemctl is-active --quiet "hryah-rooms@$( [ $p = 8090 ] && echo main || echo experimental )"; then
    echo "порт $p зайнятий чужим процесом — зупиняюсь" >&2; ss -ltnpH "sport = :$p" >&2; exit 1
  fi
done

echo "==> systemd"
cat > /etc/systemd/system/hryah-rooms@.service <<'UNIT'
[Unit]
Description=hryah rooms server (%i)
After=network.target

[Service]
User=hryah
# Поки першого релізу з сервером немає, чекаємо й пробуємо знову.
ExecStart=/bin/sh -c 'f=/srv/hryah/%i/server/rooms.mjs; [ -f "$$f" ] || { sleep 30; exit 1; }; exec /usr/bin/env node "$$f" --channel=%i'
Restart=always
RestartSec=5
MemoryMax=200M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now hryah-rooms@main hryah-rooms@experimental

echo "==> Caddy"
CF=/etc/caddy/Caddyfile
if ! grep -q 'hryah-rooms' "$CF"; then
  cp "$CF" "$CF.bak-before-rooms"
  python3 - "$CF" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
snippet = """:80 {
	# hryah-rooms: сервер кімнат консорціуму (довге опитування)
	handle_path /experimental/api/* {
		rewrite * /api{path}
		reverse_proxy 127.0.0.1:8091 {
			flush_interval -1
		}
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:8090 {
			flush_interval -1
		}
	}
"""
assert ":80 {\n" in s, "не знайшов блок :80"
open(p, "w").write(s.replace(":80 {\n", snippet, 1))
PY
  if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
    cp "$CF.bak-before-rooms" "$CF"; echo "Caddyfile не пройшов перевірку, повернув як було" >&2; exit 1
  fi
  systemctl reload caddy
fi
echo "==> готово. Сервіси стартують, щойно в релізі з'явиться server/rooms.mjs (наступний деплой)."
systemctl --no-pager --lines=0 status hryah-rooms@main hryah-rooms@experimental | grep -E "●|Active" || true
