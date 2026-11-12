#!/usr/bin/env python3
"""Малює статус на SPI-екран Pi (ST7789V 240x320, /dev/fb0, RGB565).

Читає /srv/hryah-status/status.json (його пишуть кроки workflow) і перемальовує кадр раз на кілька секунд.
Вимоги: python3-pil, шрифт DejaVu. Запускається як сервіс hryah-screen (див. hryah-screen.service).

Змінні: FB (/dev/fb0), STATUS (шлях до status.json), INTERVAL (секунди), PREVIEW=out.png (малює PNG замість fb),
        FB_SWAP=1 (поміняти порядок байтів, якщо кольори «пливуть»), FB_BGR=1 (якщо червоний і синій переплутані).
"""
import json
import os
import sys
import time

from PIL import Image, ImageDraw, ImageFont

W, H = 240, 320
FB = os.environ.get("FB", "/dev/fb0")
SRC = os.environ.get("STATUS", "/srv/hryah-status/status.json")
INTERVAL = float(os.environ.get("INTERVAL", "5"))
PREVIEW = os.environ.get("PREVIEW")
SWAP = os.environ.get("FB_SWAP") == "1"
BGR = os.environ.get("FB_BGR") == "1"

BG, CARD, FG, DIM = (11, 13, 23), (20, 24, 41), (232, 234, 243), (138, 144, 168)
OK, BAD, WARN, RUN = (61, 220, 132), (255, 92, 92), (255, 200, 61), (92, 168, 255)


def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for d in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/TTF"):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_T, F_B, F_S = font(20, True), font(14, True), font(12)


def color(v):
    return {"success": OK, "OK": OK, "failure": BAD, "BLOCKER": BAD, "cancelled": WARN, "ISSUES": WARN,
            "in_progress": RUN, "queued": RUN}.get(v, DIM)


def fit(d, text, f, width):
    while text and d.textlength(text, font=f) > width:
        text = text[:-1]
    return text


def frame(data):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((8, 6), "hryah", font=F_T, fill=FG)
    age = int(time.time() - data.get("updated", 0)) if data else None
    stale = age is None or age > 3600
    d.text((W - 8, 12), "немає даних" if data is None else (f"{age // 60} хв тому" if age >= 90 else f"{age} с тому"),
           font=F_S, fill=WARN if stale else DIM, anchor="ra")

    y = 36
    for name, label in (("main", "MAIN · прод"), ("experimental", "EXPERIMENTAL")):
        d.rounded_rectangle((6, y, W - 6, y + 44), 8, fill=CARD)
        d.text((14, y + 5), label, font=F_S, fill=DIM)
        rel = ((data or {}).get("channels") or {}).get(name) or "—"
        d.text((14, y + 22), fit(d, rel, F_B, W - 28), font=F_B, fill=FG)
        y += 50

    prs = (data or {}).get("prs") or []
    d.text((8, y + 2), f"Відкриті PR: {len(prs)}", font=F_S, fill=DIM)
    y += 20
    for p in prs[:5]:
        d.ellipse((10, y + 4, 18, y + 12), fill=color(p.get("check")))
        d.ellipse((22, y + 4, 30, y + 12), fill=color(p.get("review")))
        d.text((36, y), fit(d, f"#{p['number']} → {p['base']}", F_S, W - 44), font=F_S, fill=FG)
        y += 18

    y = max(y + 6, 218)
    d.text((8, y), "Останні запуски", font=F_S, fill=DIM)
    y += 18
    for r in ((data or {}).get("runs") or [])[:5]:
        v = r.get("conclusion") or r.get("status")
        d.ellipse((10, y + 4, 18, y + 12), fill=color(v))
        d.text((26, y), fit(d, f"{r.get('branch', '')} · {r.get('name', '')}", F_S, W - 34), font=F_S, fill=FG)
        y += 18
        if y > H - 14:
            break
    return img


def rgb565(img):
    raw = img.tobytes()
    out = bytearray(W * H * 2)
    j = 0
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        if BGR:
            r, b = b, r
        v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        if SWAP:
            v = ((v & 0xFF) << 8) | (v >> 8)
        out[j] = v & 0xFF
        out[j + 1] = v >> 8
        j += 2
    return bytes(out)


def load():
    try:
        with open(SRC, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def main():
    while True:
        img = frame(load())
        if PREVIEW:
            img.save(PREVIEW)
            return
        try:
            with open(FB, "wb", buffering=0) as f:
                f.write(rgb565(img))
        except OSError as e:
            print(f"fb: {e}", file=sys.stderr)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
