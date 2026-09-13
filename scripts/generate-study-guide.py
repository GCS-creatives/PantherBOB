import json
# scripts/generate-study-guide.py
#
# Run from the project root: python3 scripts/generate-study-guide.py
# (needs the `reportlab` package: pip install reportlab)
#
# Regenerates assets/panther-bob-study-guide.pdf from data/books.json and
# data/seed-questions.json. Re-run this if the book list or question bank
# changes and you want the printable guide to stay in sync.

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem,
    KeepTogether, HRFlowable, Table, TableStyle
)
from reportlab.lib.enums import TA_CENTER

NAVY = colors.HexColor("#0a1172")
NAVY_DARK = colors.HexColor("#060a4d")
GOLD = colors.HexColor("#f5c518")
MUTED = colors.HexColor("#5a5f85")

books = json.load(open("data/books.json"))
questions = json.load(open("data/seed-questions.json"))

by_title = {}
for q in questions:
    by_title.setdefault(q["answerTitle"], []).append(q)

styles = getSampleStyleSheet()
title_style = ParagraphStyle("CoverTitle", parent=styles["Title"], textColor=NAVY, fontSize=26, spaceAfter=6)
subtitle_style = ParagraphStyle("CoverSubtitle", parent=styles["Normal"], textColor=MUTED, fontSize=13, alignment=TA_CENTER, spaceAfter=4)
book_title_style = ParagraphStyle("BookTitle", parent=styles["Heading2"], textColor=NAVY, fontSize=14, spaceBefore=4, spaceAfter=2)
book_author_style = ParagraphStyle("BookAuthor", parent=styles["Normal"], textColor=MUTED, fontSize=10.5, spaceAfter=8, fontName="Helvetica-Oblique")
fact_style = ParagraphStyle("Fact", parent=styles["Normal"], fontSize=10.5, leading=14)
footer_style = ParagraphStyle("Footer", parent=styles["Normal"], textColor=MUTED, fontSize=8, alignment=TA_CENTER)

story = []

# Cover
story.append(Spacer(1, 1.6 * inch))
story.append(Paragraph("Panther Bob Study Guide", title_style))
story.append(Paragraph("NC Middle School Battle of the Books &middot; 2026&ndash;2027", subtitle_style))
story.append(Paragraph("16 books, key facts to know for every title", subtitle_style))
story.append(Spacer(1, 0.4 * inch))
story.append(HRFlowable(width="60%", thickness=1, color=GOLD, hAlign="CENTER"))
story.append(Spacer(1, 0.5 * inch))

# Table of contents
toc_data = [[Paragraph(f"{i+1}. {b['title']}", fact_style), Paragraph(b["author"], book_author_style)] for i, b in enumerate(books)]
toc_table = Table(toc_data, colWidths=[4.6 * inch, 2.2 * inch])
toc_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
]))
story.append(toc_table)
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph(
    "Facts below are drawn from the same clue bank used in the site's games &mdash; "
    "arranged easiest to most obscure for each book.",
    ParagraphStyle("Note", parent=styles["Normal"], textColor=MUTED, fontSize=9, alignment=TA_CENTER)
))

from reportlab.platypus import PageBreak
story.append(PageBreak())

for i, b in enumerate(books):
    facts = sorted(by_title.get(b["title"], []), key=lambda q: q["points"])[:5]
    block = []
    block.append(Paragraph(f"{i+1}. {b['title']}", book_title_style))
    block.append(Paragraph(f"by {b['author']}", book_author_style))
    if facts:
        items = [ListItem(Paragraph(f["clue"], fact_style), spaceAfter=4) for f in facts]
        block.append(ListFlowable(items, bulletType="bullet", start="circle", leftIndent=14))
    else:
        block.append(Paragraph("(No facts available yet.)", fact_style))
    block.append(Spacer(1, 14))
    block.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd")))
    block.append(Spacer(1, 10))
    story.append(KeepTogether(block))

def add_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(letter[0] / 2, 0.5 * inch, f"GCS Creatives Project — Grace Campbell-Sheran — Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(
    "assets/panther-bob-study-guide.pdf",
    pagesize=letter,
    topMargin=0.7 * inch,
    bottomMargin=0.8 * inch,
    leftMargin=0.8 * inch,
    rightMargin=0.8 * inch,
    title="Panther Bob Study Guide",
)
doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
print("PDF generated.")
