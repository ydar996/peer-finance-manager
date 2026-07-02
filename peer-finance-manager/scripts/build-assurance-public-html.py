#!/usr/bin/env python3
"""Build themed about.html and bylaws.html from extracted document text."""
import html as htmlmod
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ABOUT_SOURCE = ROOT / "seed" / "assurance" / "public" / "about-source.txt"
BYLAWS_SOURCE = ROOT / "seed" / "assurance" / "public" / "bylaws-source.txt"
ABOUT_TARGET = ROOT / "seed" / "assurance" / "public" / "about.html"
BYLAWS_TARGET = ROOT / "seed" / "assurance" / "public" / "bylaws.html"

ABOUT_HEADINGS = {
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

ABOUT_SLUGS = {
    "Summary": "summary",
    "Mission Statement": "mission",
    "Overview": "overview",
    "Membership": "membership",
    "Goals": "goals",
    "Marketing and Sales Strategy": "marketing",
    "Publicity Plan": "publicity",
    "Benefits of joining AIC": "benefits",
    "Income Plan": "income",
    "Conclusion": "conclusion",
    "Officials": "officials",
}

LIST_INTRO_SECTIONS = {
    "Marketing and Sales Strategy",
    "Publicity Plan",
    "Benefits of joining AIC",
    "Income Plan",
}


def esc(text):
    return htmlmod.escape(str(text).replace("&amp;", "&").strip())


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "section"


def clean_bylaws_text(text):
    text = re.sub(r"Page \d+ of \d+ \|[^\n]*\n", "\n", text)
    text = re.sub(r"\b(\w+)- (\w)", r"\1\2", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_about():
    lines = [ln.strip() for ln in ABOUT_SOURCE.read_text(encoding="utf-8").splitlines()]
    lines = [ln for ln in lines if ln]
    title = lines[0]
    body = lines[1:]

    out = ['<div class="cp-page-body cp-about">', f'<p class="cp-doc-kicker">About our cooperative</p>']

    current = None
    in_list = False
    photo_overview = False
    photo_membership = False

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def open_section(name):
        nonlocal current
        close_list()
        current = name
        sid = ABOUT_SLUGS.get(name, slugify(name))
        out.append(f'<section class="cp-section" id="{sid}">')
        out.append(f'<h2 class="cp-section-title">{esc(name)}</h2>')

    def close_section():
        close_list()
        out.append("</section>")

    def add_para(text):
        nonlocal photo_overview, photo_membership, current
        if current == "Membership" and "$100" in text and "$50" in text:
            out.append(
                '<div class="cp-stat-grid">'
                '<div class="cp-stat"><span class="cp-stat-value">$100</span><span class="cp-stat-label">One-time intake deposit</span></div>'
                '<div class="cp-stat"><span class="cp-stat-value">$50+</span><span class="cp-stat-label">Minimum monthly contribution</span></div>'
                '<div class="cp-stat"><span class="cp-stat-value">$3,000</span><span class="cp-stat-label">Maximum monthly installment</span></div>'
                "</div>"
            )
        out.append(f"<p>{esc(text)}</p>")
        if current == "Overview" and not photo_overview:
            out.append(
                '<figure class="cp-figure">'
                '<img src="about/community-meeting.png" alt="Cooperative community meeting" loading="lazy" />'
                "<figcaption>Members gathering to discuss cooperative goals and decisions.</figcaption>"
                "</figure>"
            )
            photo_overview = True

    for raw in body:
        if raw in ABOUT_HEADINGS:
            if current:
                close_section()
            open_section(raw)
            continue

        if raw.startswith(("Immediate goal", "Short-term goal")):
            close_list()
            label, _, rest = raw.partition("\u2013")
            if not rest.strip():
                label, _, rest = raw.partition("-")
            out.append(f'<h3 class="cp-subsection-title">{esc(label.strip())}</h3>')
            if rest.strip():
                add_para(rest.strip())
            continue

        if raw == "Long-term plan" or raw.startswith("Long-term plan"):
            close_list()
            out.append('<h3 class="cp-subsection-title">Long-term plan</h3>')
            remainder = raw.replace("Long-term plan", "", 1).strip(" \u2013-")
            if remainder:
                add_para(remainder)
            continue

        if current == "Membership" and raw == "Members of the cooperative are expected to:":
            close_list()
            out.append(f"<p>{esc(raw)}</p><ul class='cp-check-list'>")
            in_list = True
            continue

        if current == "Membership" and in_list:
            out.append(f"<li>{esc(raw)}</li>")
            if "By fulfilling these responsibilities" in raw and not photo_membership:
                close_list()
                out.append(
                    '<figure class="cp-figure">'
                    '<img src="about/member-gathering.png" alt="Cooperative member gathering" loading="lazy" />'
                    "<figcaption>Cooperative meetings keep every member informed and involved.</figcaption>"
                    "</figure>"
                )
                photo_membership = True
            continue

        if current == "Officials":
            close_list()
            if not any("cp-official-grid" in x for x in out[-5:]):
                out.append('<div class="cp-official-grid">')
            parts = raw.split("-", 1)
            if len(parts) == 2:
                name_role, phone = parts[0].strip(), parts[1].strip()
                out.append(
                    f'<div class="cp-official-card"><p class="cp-official-name">{esc(name_role)}</p>'
                    f'<p class="cp-official-phone">{esc(phone)}</p></div>'
                )
            else:
                out.append(f'<div class="cp-official-card"><p class="cp-official-name">{esc(raw)}</p></div>')
            continue

        if current in LIST_INTRO_SECTIONS and ":" in raw and not raw.startswith("Assurance"):
            if current == "Benefits of joining AIC" and raw.startswith("Joining "):
                close_list()
                add_para(raw)
                out.append('<ul class="cp-benefit-list">')
                in_list = True
                continue
            close_list()
            if not in_list:
                out.append('<ul class="cp-benefit-list">')
                in_list = True
            label, _, body_text = raw.partition(":")
            out.append(
                f'<li><strong>{esc(label.strip())}</strong><span>{esc(body_text.strip())}</span></li>'
            )
            continue

        close_list()
        add_para(raw)

    if current:
        if current == "Officials":
            out.append("</div>")
        close_section()

    out.append(
        '<div class="cp-crosslink-card">'
        '<p>Ready to review how we are governed?</p>'
        '<a class="cp-crosslink-btn" href="/c/assurance/bylaws">Read our Bylaws</a>'
        "</div>"
    )
    out.append("</div>")
    ABOUT_TARGET.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {ABOUT_TARGET}")


def build_bylaws():
    text = clean_bylaws_text(BYLAWS_SOURCE.read_text(encoding="utf-8"))
    chunks = re.split(r"\n(?=ARTICLE\s+\d+\.)", text)
    out = [
        '<div class="cp-page-body cp-bylaws">',
        '<p class="cp-doc-kicker">Governance document</p>',
        '<section class="cp-section cp-intro-card" id="introduction">',
        "<h2 class=\"cp-section-title\">Introduction</h2>",
    ]

    intro = chunks[0] if chunks else text
    intro_lines = [ln.strip() for ln in intro.splitlines() if ln.strip()]
  # skip duplicate title lines
    for ln in intro_lines:
        if "BYLAWS" in ln.upper() and len(ln) < 80:
            continue
        if ln.lower() == "introduction":
            continue
        out.append(f"<p>{esc(ln)}</p>")
    out.append("</section>")

    for chunk in chunks[1:]:
        lines = [ln.strip() for ln in chunk.splitlines() if ln.strip()]
        if not lines:
            continue
        header = lines[0]
        m = re.match(r"ARTICLE\s+(\d+)\.\s*(.*)", header, re.I)
        if not m:
            continue
        num, title = m.group(1), m.group(2).strip()
        sid = f"article-{num}"
        out.append(f'<section class="cp-section" id="{sid}">')
        out.append(
            f'<h2 class="cp-section-title"><span class="cp-article-num">Article {num}</span>{esc(title)}</h2>'
        )

        in_ul = False
        for ln in lines[1:]:
            if re.match(r"^\d+\.\d+\.", ln):
                if in_ul:
                    out.append("</ul>")
                    in_ul = False
                out.append(f'<h3 class="cp-subsection-title">{esc(ln)}</h3>')
                continue
            if re.match(r"^[a-z]\.\s", ln, re.I):
                if not in_ul:
                    out.append('<ul class="cp-legal-list">')
                    in_ul = True
                out.append(f"<li>{esc(ln)}</li>")
                continue
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<p>{esc(ln)}</p>")
        if in_ul:
            out.append("</ul>")
        out.append("</section>")

    out.append(
        '<div class="cp-crosslink-card">'
        '<p>Learn more about our mission and membership.</p>'
        '<a class="cp-crosslink-btn" href="/c/assurance/about">Back to About Us</a>'
        "</div>"
    )
    out.append("</div>")
    BYLAWS_TARGET.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Wrote {BYLAWS_TARGET}")


if __name__ == "__main__":
    build_about()
    build_bylaws()
