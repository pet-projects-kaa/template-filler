#!/usr/bin/env python3
"""Idempotently adds the TemplateFiller route to the existing Caddy site block."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

BEGIN = "# BEGIN TEMPLATE-FILLER (managed by GitHub Actions)"
END = "# END TEMPLATE-FILLER (managed by GitHub Actions)"

SNIPPET = [
    BEGIN,
    "redir /templates /templates/",
    "",
    "handle_path /templates/* {",
    "    reverse_proxy template-filler:8080",
    "}",
    END,
]


def remove_managed_block(lines: list[str]) -> list[str]:
    result: list[str] = []
    skipping = False
    skip_one_blank_after = False

    for line in lines:
        if BEGIN in line:
            skipping = True
            continue
        if skipping and END in line:
            skipping = False
            skip_one_blank_after = True
            continue
        if skipping:
            continue
        if skip_one_blank_after and not line.strip():
            skip_one_blank_after = False
            continue
        skip_one_blank_after = False
        result.append(line)

    if skipping:
        raise ValueError(f"Found {BEGIN!r}, but not the matching end marker")

    return result



def remove_legacy_route(lines: list[str]) -> list[str]:
    """Remove the pre-managed route form from earlier setup instructions."""
    result: list[str] = []
    i = 0

    while i < len(lines):
        stripped = lines[i].strip()

        if stripped == "redir /templates /templates/":
            i += 1
            if i < len(lines) and not lines[i].strip():
                i += 1
            continue

        if stripped.startswith("handle_path /templates/*") and "{" in stripped:
            depth = lines[i].split("#", 1)[0].count("{") - lines[i].split("#", 1)[0].count("}")
            i += 1
            while i < len(lines) and depth > 0:
                code = lines[i].split("#", 1)[0]
                depth += code.count("{") - code.count("}")
                i += 1
            if i < len(lines) and not lines[i].strip():
                i += 1
            continue

        result.append(lines[i])
        i += 1

    return result


def site_line_matches(line: str, domain: str) -> bool:
    stripped = line.split("#", 1)[0].strip()
    if not stripped or stripped.startswith("{"):
        return False

    before_brace = stripped.split("{", 1)[0]
    labels = [part.strip() for part in before_brace.split(",")]
    return any(
        label == domain
        or label.startswith(f"https://{domain}")
        or label.startswith(f"http://{domain}")
        for label in labels
    )


def leading_whitespace(value: str) -> str:
    return value[: len(value) - len(value.lstrip())]


def configure(text: str, domain: str) -> str:
    trailing_newline = text.endswith("\n")
    lines = remove_legacy_route(remove_managed_block(text.splitlines()))

    site_index = next((i for i, line in enumerate(lines) if site_line_matches(line, domain)), None)
    if site_index is None:
        raise ValueError(f"Site block for {domain!r} was not found")

    open_index: int | None = None
    depth = 0

    for i in range(site_index, len(lines)):
        code = lines[i].split("#", 1)[0]
        opens = code.count("{")
        closes = code.count("}")
        if opens and open_index is None:
            open_index = i
        depth += opens - closes
        if open_index is not None:
            break

    if open_index is None or depth <= 0:
        raise ValueError(f"Opening brace for site block {domain!r} was not found")

    base_indent = leading_whitespace(lines[open_index]) + "    "
    inserted = [base_indent + line if line else "" for line in SNIPPET]

    # Put the route first inside the site block so a catch-all handler cannot swallow it.
    result = lines[: open_index + 1] + inserted + [""] + lines[open_index + 1 :]
    output = "\n".join(result)
    if trailing_newline:
        output += "\n"
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--domain", default="annushkaaaaa.store")
    args = parser.parse_args()

    try:
        source = args.input.read_text(encoding="utf-8")
        configured = configure(source, args.domain)
        args.output.write_text(configured, encoding="utf-8")
    except (OSError, ValueError) as error:
        print(f"Caddy configuration error: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
