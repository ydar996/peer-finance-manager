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
    s = htmlmod.escape(str(text).replace("&amp;", "&").strip())
    s = s.replace("\u2014", ":").replace("\u2013", "-")
    return s


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


PAGE_HEADER_RE = re.compile(r"^Page\s+\d+\s+of\s+\d+\s*\|.*$", re.I)
ARTICLE_RE = re.compile(r"^ARTICLE\s+(\d+)\.\s*(.*)$", re.I)
SECTION_RE = re.compile(r"^(\d+\.\d+)\.\s*(.+)$")
LETTER_ITEM_RE = re.compile(r"^([a-z])\.\s+(.+)$")
ROMAN_ITEM_RE = re.compile(r"^([IVX]+)\.\s+(.+)$")


def is_block_start(line):
    s = line.strip()
    if not s:
        return False
    if PAGE_HEADER_RE.match(s):
        return True
    if ARTICLE_RE.match(s):
        return True
    if SECTION_RE.match(s):
        return True
    if ROMAN_ITEM_RE.match(s):
        return True
    if LETTER_ITEM_RE.match(s):
        return True
    return False


def merge_wrapped_lines(raw_lines):
    """Join PDF line breaks so list items and paragraphs stay intact."""
    merged = []
    for raw in raw_lines:
        line = re.sub(r"\s+", " ", raw.strip())
        if not line or PAGE_HEADER_RE.match(line):
            continue
        if not merged:
            merged.append(line)
            continue
        if is_block_start(line):
            merged.append(line)
        else:
            merged[-1] = (merged[-1] + " " + line).strip()
    return merged


def parse_section_line(line):
    m = SECTION_RE.match(line.strip())
    if not m:
        return None
    num = m.group(1)
    rest = m.group(2).strip()
    # Title ends at first ". " when more substantive text follows (e.g. "2.2. Becoming a member. To become...")
    split = re.split(r"\.\s+(?=[A-Z])", rest, maxsplit=1)
    if len(split) == 2 and len(split[0]) < 120:
        title = split[0].rstrip(".") + "."
        intro = split[1].strip()
        return num, title, intro
    title = rest if rest.endswith(".") else rest
    return num, title, None


def close_bylaws_lists(out, state):
    """Close open roman sub-list, letter item, and letter list."""
    if state["roman_open"]:
        out.append("</ol>")
        state["roman_open"] = False
    if state["open_li"]:
        out.append("</li>")
        state["open_li"] = False
    state["expect_roman"] = False
    if state["ul_open"]:
        out.append("</ul>")
        state["ul_open"] = False


def render_bylaws_body(lines, out):
    """Render merged lines inside an article (or intro) into HTML."""
    state = {
        "ul_open": False,
        "open_li": False,
        "roman_open": False,
        "expect_roman": False,
    }

    def close_lists():
        close_bylaws_lists(out, state)

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue

        sec = parse_section_line(line)
        if sec:
            close_lists()
            num, title, intro = sec
            out.append(
                f'<h3 class="cp-subsection-title" id="section-{num.replace(".", "-")}">'
                f'<span class="cp-section-num">{esc(num)}</span> {esc(title)}</h3>'
            )
            if intro:
                out.append(f'<p class="cp-section-lead">{esc(intro)}</p>')
            continue

        roman = ROMAN_ITEM_RE.match(line)
        if roman:
            body = roman.group(2).strip()
            if state["expect_roman"] or state["roman_open"]:
                if not state["roman_open"]:
                    out.append('<ol class="cp-roman-list" type="I">')
                    state["roman_open"] = True
                    state["expect_roman"] = False
                out.append(f"<li>{esc(body)}</li>")
            else:
                close_lists()
                out.append('<ol class="cp-roman-list cp-roman-list-standalone" type="I">')
                out.append(f"<li>{esc(body)}</li>")
                state["roman_open"] = True
            continue

        letter = LETTER_ITEM_RE.match(line)
        if letter:
            label = letter.group(1).lower()
            body = letter.group(2).strip()

            if state["roman_open"]:
                out.append("</ol>")
                state["roman_open"] = False
                if state["open_li"]:
                    out.append("</li>")
                    state["open_li"] = False
            elif state["open_li"]:
                out.append("</li>")
                state["open_li"] = False
            state["expect_roman"] = False

            if not state["ul_open"]:
                out.append('<ul class="cp-legal-list">')
                state["ul_open"] = True

            if body.rstrip().endswith(":"):
                out.append(
                    f'<li><span class="cp-list-label">{esc(label)}.</span> {esc(body)}'
                )
                state["open_li"] = True
                state["expect_roman"] = True
            else:
                out.append(
                    f'<li><span class="cp-list-label">{esc(label)}.</span> {esc(body)}</li>'
                )
            continue

        if state["roman_open"]:
            out.append("</ol>")
            state["roman_open"] = False
        close_lists()
        out.append(f"<p>{esc(line)}</p>")

    close_lists()


def build_bylaws():
    raw = BYLAWS_SOURCE.read_text(encoding="utf-8")
    raw = re.sub(r"\b(\w+)- (\w)", r"\1\2", raw)
    all_lines = raw.splitlines()
    merged = merge_wrapped_lines(all_lines)

    out = [
        '<div class="cp-page-body cp-bylaws">',
        '<p class="cp-doc-kicker">Governance document</p>',
        '<p class="cp-doc-meta">Assurance Investment and Cooperative Inc. · Adopted December 9, 2022 · Updated December 22, 2022</p>',
        '<section class="cp-section cp-intro-card" id="introduction">',
        '<h2 class="cp-section-title">Introduction</h2>',
    ]

    # Introduction: lines before first ARTICLE
    intro_lines = []
    article_chunks = []
    current_article = None
    for line in merged:
        am = ARTICLE_RE.match(line)
        if am:
            if current_article:
                article_chunks.append(current_article)
            current_article = {"num": am.group(1), "title": am.group(2).strip(), "lines": []}
            continue
        if current_article is None:
            if line.upper() == "INTRODUCTION":
                continue
            if "BYLAWS" in line.upper() and len(line) < 90:
                continue
            intro_lines.append(line)
        else:
            current_article["lines"].append(line)
    if current_article:
        article_chunks.append(current_article)

    # Clean introduction blob from PDF header
    cleaned_intro = []
    for line in intro_lines:
        line = re.sub(
            r"^ASSURANCE INVESTMENT AND COOPERATIVE INC\.?\s*BYLAWS\s*Introduction\s*",
            "",
            line,
            flags=re.I,
        ).strip()
        if line:
            cleaned_intro.append(line)

    render_bylaws_body(cleaned_intro, out)
    out.append("</section>")

    for art in article_chunks:
        sid = f"article-{art['num']}"
        out.append(f'<section class="cp-section" id="{sid}">')
        out.append(
            f'<h2 class="cp-section-title">'
            f'<span class="cp-article-num">Article {art["num"]}</span>'
            f'{esc(art["title"])}</h2>'
        )
        render_bylaws_body(art["lines"], out)
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
    import sys

    if "--bylaws-only" in sys.argv or "--bylaws" in sys.argv:
        build_bylaws()
    elif "--about-only" in sys.argv or "--about" in sys.argv:
        build_about()
    else:
        build_about()
        build_bylaws()
