#!/usr/bin/env python3
"""Збирає status.json для екрана на Pi. Викликається з кроків workflow на Pi-runner.

Не потребує власного токена: працює з GITHUB_TOKEN поточного workflow.
Завжди завершується з кодом 0, щоб не валити деплой через екран.
"""
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
OUT = os.environ.get("STATUS_FILE", "/srv/hryah-status/status.json")
PUBLIC_OUT = os.environ.get("STATUS_PUBLIC_FILE", "/srv/hryah-status-public/status.json")
ROOT = os.environ.get("HRYAH_ROOT", "/srv/hryah")
MARKER = "<!-- hryah-ai-review -->"


def api(path):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "hryah-status",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except Exception as e:  # екран не критичний
        print(f"api {path}: {e}", file=sys.stderr)
        return None


def active(channel):
    link = os.path.join(ROOT, channel)
    return os.path.basename(os.path.realpath(link)) if os.path.exists(link) else None


def pr_info(pr):
    sha = pr["head"]["sha"]
    checks = api(f"/commits/{sha}/check-runs?per_page=30") or {}
    ci = next((c for c in checks.get("check_runs", []) if c["name"] == "check & build"), None)
    verdict = None
    for c in reversed(api(f"/issues/{pr['number']}/comments?per_page=100") or []):
        if MARKER in (c.get("body") or ""):
            m = re.search(r"##\s*\S+\s*AI-рев'ю:\s*(\w+)", c["body"])
            verdict = m.group(1) if m else None
            break
    return {
        "number": pr["number"],
        "title": pr["title"],
        "author": pr["user"]["login"],
        "base": pr["base"]["ref"],
        "draft": pr["draft"],
        "url": pr["html_url"],
        "check": (ci or {}).get("conclusion") or (ci or {}).get("status"),
        "review": verdict,
    }


def write(path, data):
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        return
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def write_public(data):
    """Версія для публічного дашборду (Funnel): без назв PR, логінів і назв особистих гілок."""
    keep = ("main", "experimental")
    pub = {
        "updated": data["updated"],
        "repo": "hryah",
        "channels": data["channels"],
        "prs": [
            {k: p[k] for k in ("number", "base", "draft", "check", "review")}
            for p in data["prs"]
        ],
        "runs": [
            {
                "name": r["name"],
                "branch": r["branch"] if r["branch"] in keep else "feature/*",
                "status": r["status"],
                "conclusion": r["conclusion"],
                "at": r["at"],
            }
            for r in data["runs"]
        ],
    }
    write(PUBLIC_OUT, pub)


def main():
    prs = [pr_info(p) for p in (api("/pulls?state=open&per_page=15") or [])]
    runs = (api("/actions/runs?per_page=8") or {}).get("workflow_runs", [])
    data = {
        "updated": int(time.time()),
        "repo": REPO,
        "channels": {c: active(c) for c in ("main", "experimental")},
        "prs": prs,
        "runs": [
            {
                "name": r["name"],
                "branch": r["head_branch"],
                "status": r["status"],
                "conclusion": r["conclusion"],
                "actor": (r.get("actor") or {}).get("login"),
                "title": (r.get("display_title") or "")[:80],
                "url": r["html_url"],
                "at": r["updated_at"],
            }
            for r in runs
        ],
    }
    write(OUT, data)
    write_public(data)
    print(f"status → {OUT}: {len(prs)} PR, {len(runs)} runs")


try:
    main()
except Exception as e:
    print(f"write-status: {e}", file=sys.stderr)
sys.exit(0)
