#!/usr/bin/env python3
"""Build seed/assurance/public/about.html from about-source.txt (DOCX extract)."""
import html as htmlmod
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "seed" / "assurance" / "public" / "about-source.txt"
TARGET = ROOT / "seed" / "assurance" / "public" / "about.html"

HEADINGS = {
    "Summary",
    "Mission Statement",
    "Overview",
    "Membership",
    "Goals",
    "Marketing and Sales Strategy",
    "Publicity Plan",
    "Benefits of joining AIC",
    "Income Plan",
    "Conclusion",
    "Officials",
}

LIST_INTRO = {
    "Marketing and Sales Strategy",
    "Publicity Plan",
    "Benefits of joining AIC",
    "Income Plan",
}


def main():
    raw_lines = [ln.strip() for ln in SOURCE.read_text(encoding="utf-8").splitlines()]
    lines = [ln for ln in raw_lines if ln]
    title = lines[0]
    body_lines = lines[1:]

    out = ['<div class="public-about-content">', f"<h1>{htmlmod.escape(title)}</h1>"]

    current = None
    in_list = False
    photo_after_overview = False
    photo_after_membership = False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def open_list():
        nonlocal in_list
        if not in_list:
            out.append("<ul>")
            in_list = True

    def add_paragraph(text):
        nonlocal photo_after_overview, photo_after_membership, current
        out.append(f"<p>{htmlmod.escape(text)}</p>")
        if current == "Overview" and not photo_after_overview:
            out.append(
                '<figure class="public-about-figure">'
                '<img src="about/community-meeting.png" alt="Assurance cooperative community meeting" />'
                "<figcaption>Cooperative members at a community meeting.</figcaption>"
                "</figure>"
            )
            photo_after_overview = True

    for raw in body_lines:
        if raw in HEADINGS:
            close_list()
            current = raw
            out.append(f"<h2>{htmlmod.escape(raw)}</h2>")
            continue

        if raw.startswith("Immediate goal") or raw.startswith("Short-term goal"):
            close_list()
            label, _, rest = raw.partition("\u2013")
            if not rest.strip():
                rest = ""
            out.append(f"<h3>{htmlmod.escape(label.strip())}</h3>")
            if rest.strip():
                add_paragraph(rest.strip())
            continue

        if raw == "Long-term plan" or raw.startswith("Long-term plan"):
            close_list()
            out.append("<h3>Long-term plan</h3>")
            remainder = raw.replace("Long-term plan", "", 1).strip(" \u2013-")
            if remainder:
                add_paragraph(remainder)
            continue

        if current == "Membership" and raw == "Members of the cooperative are expected to:":
            close_list()
            out.append(f"<p>{htmlmod.escape(raw)}</p>")
            open_list()
            continue

        if current == "Membership" and in_list:
            if "By fulfilling these responsibilities" in raw and not photo_after_membership:
                out.append(f"<li>{htmlmod.escape(raw)}</li>")
                close_list()
                out.append(
                    '<figure class="public-about-figure">'
                    '<img src="about/member-gathering.png" alt="Assurance cooperative member gathering" />'
                    "<figcaption>Members gathering to discuss cooperative goals and decisions.</figcaption>"
                    "</figure>"
                )
                photo_after_membership = True
                continue
            out.append(f"<li>{htmlmod.escape(raw)}</li>")
            continue

        if current == "Officials":
            open_list()
            out.append(f"<li>{htmlmod.escape(raw)}</li>")
            continue

        if current in LIST_INTRO and ":" in raw and not raw.startswith("Assurance"):
            if current == "Benefits of joining AIC" and raw.startswith("Joining "):
                close_list()
                add_paragraph(raw)
                open_list()
                continue
            open_list()
            label, _, body = raw.partition(":")
            out.append(
                f"<li><strong>{htmlmod.escape(label.strip())}:</strong> {htmlmod.escape(body.strip())}</li>"
            )
            continue

        if current in LIST_INTRO and raw.endswith(":") and "following" in raw.lower():
            close_list()
            add_paragraph(raw)
            open_list()
            continue

        close_list()
        add_paragraph(raw.replace("&amp;", "&"))

    close_list()
    out.append(
        '<p class="public-about-crosslink"><a href="/c/assurance/bylaws">View our Bylaws</a></p>'
    )
    out.append("</div>")
    TARGET.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {TARGET} ({len(''.join(out))} chars)")


if __name__ == "__main__":
    main()
