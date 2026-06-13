#!/usr/bin/env python3
"""
create-library-issues.py
========================
Reads library-issues.json and creates 12 labels + 16 GitHub Issues
representing the LIB-XXX implementation tickets from library-spec.md.

Prerequisites:
  - `gh` CLI installed and authenticated (`gh auth status` passes)
  - Run from the repo root (so `gh` knows which repo to target)

Usage:
  python3 create-library-issues.py           # create everything
  python3 create-library-issues.py --dry-run # print what would happen
  python3 create-library-issues.py --labels-only
  python3 create-library-issues.py --only LIB-001 LIB-009

The script is idempotent:
  - Labels use `gh label create --force` (overwrites color/description)
  - Issues are matched by title prefix "[LIB-XXX]"; existing issues are skipped
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable

JSON_PATH = Path(__file__).parent / "library-issues.json"


# ---------- preflight ----------

def check_gh() -> None:
    if shutil.which("gh") is None:
        sys.exit("ERROR: `gh` CLI not found. Install: https://cli.github.com")
    res = subprocess.run(
        ["gh", "auth", "status"], capture_output=True, text=True
    )
    if res.returncode != 0:
        sys.exit(
            "ERROR: `gh` is not authenticated. Run `gh auth login` first.\n"
            f"  {res.stderr.strip()}"
        )


def run(cmd: list[str], dry_run: bool = False) -> subprocess.CompletedProcess:
    if dry_run:
        print("  DRY:", " ".join(cmd))
        return subprocess.CompletedProcess(cmd, 0, "", "")
    return subprocess.run(cmd, capture_output=True, text=True)


# ---------- labels ----------

def create_labels(labels: list[dict], dry_run: bool) -> int:
    print(f"\n[labels] creating {len(labels)} labels...")
    for label in labels:
        name = label["name"]
        cmd = [
            "gh", "label", "create", name,
            "--color", label["color"],
            "--description", label["description"],
            "--force",  # idempotent
        ]
        res = run(cmd, dry_run)
        if res.returncode != 0 and "already exists" not in (res.stderr + res.stdout).lower():
            print(f"  ! failed: {name}: {res.stderr.strip()}")
        else:
            print(f"  ✓ {name}")
    return len(labels)


# ---------- issues ----------

def issue_title_prefix(ticket_id: str) -> str:
    """Match existing issues by this prefix (idempotency key)."""
    return f"[{ticket_id}]"


def existing_issue_numbers(ticket_id: str) -> list[int]:
    """Return any issue numbers whose title starts with [LIB-XXX]."""
    res = subprocess.run(
        [
            "gh", "issue", "list",
            "--search", f"{issue_title_prefix(ticket_id)} in:title",
            "--state", "all",
            "--json", "number",
            "--limit", "5",
        ],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        return []
    try:
        return [item["number"] for item in json.loads(res.stdout or "[]")]
    except json.JSONDecodeError:
        return []


def create_issue(issue: dict, dry_run: bool) -> str:
    ticket_id = issue["id"]
    title = f"{issue_title_prefix(ticket_id)} {issue['title']}"
    labels = issue.get("labels", [])

    if not dry_run:
        existing = existing_issue_numbers(ticket_id)
        if existing:
            print(f"  · {ticket_id} already exists (#{existing[0]}), skipping")
            return f"#{existing[0]}"

    cmd = [
        "gh", "issue", "create",
        "--title", title,
        "--body", issue["body"],
    ]
    for label in labels:
        cmd.extend(["--label", label])

    res = run(cmd, dry_run)
    if res.returncode != 0:
        print(f"  ! {ticket_id} failed: {res.stderr.strip()}")
        return ""
    # `gh issue create` prints the new issue URL on stdout
    url = (res.stdout or "").strip().splitlines()[-1] if res.stdout else ""
    print(f"  ✓ {ticket_id}: {url or '(dry-run)'}")
    return url


def create_issues(issues: list[dict], dry_run: bool, only: Iterable[str] | None) -> int:
    selected = issues
    if only:
        only_set = {x.upper() for x in only}
        selected = [i for i in issues if i["id"].upper() in only_set]
        if not selected:
            sys.exit(f"ERROR: no tickets matched {list(only)}")

    print(f"\n[issues] creating {len(selected)} issues...")
    for issue in selected:
        create_issue(issue, dry_run)
    return len(selected)


# ---------- main ----------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them")
    parser.add_argument("--labels-only", action="store_true", help="Create labels but skip issues")
    parser.add_argument("--issues-only", action="store_true", help="Create issues but skip labels")
    parser.add_argument("--only", nargs="+", metavar="LIB-XXX", help="Only create specific tickets (e.g. --only LIB-001 LIB-009)")
    args = parser.parse_args()

    if not JSON_PATH.exists():
        sys.exit(f"ERROR: {JSON_PATH} not found. Run from the repo root.")

    with JSON_PATH.open() as f:
        data = json.load(f)

    labels = data.get("labels", [])
    issues = data.get("issues", [])

    print(f"Source: {JSON_PATH}")
    print(f"  labels: {len(labels)}")
    print(f"  issues: {len(issues)}")

    check_gh()

    if not args.issues_only:
        create_labels(labels, args.dry_run)
    if not args.labels_only:
        create_issues(issues, args.dry_run, args.only)

    print("\nDone.")
    print("View all library issues:")
    print('  gh issue list --label lib --state all')
    return 0


if __name__ == "__main__":
    sys.exit(main())
