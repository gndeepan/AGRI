"""Crop-plan PDF export (English; Tamil glyphs need an embedded Tamil font, not bundled yet)."""

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _table(rows: list[list[str]], widths: list[float]) -> Table:
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2f5d34")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c4b0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def cycle_pdf(cycle: dict, land: dict, tasks: list[dict], observations: list[dict], inputs: list[dict]) -> bytes:
    styles = getSampleStyleSheet()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm,
                            bottomMargin=15 * mm, title=f"Bhoomi AI crop plan — {land['name']}")
    m = land["metrics"]
    variety = cycle["variety"]["name"] if cycle["variety"] else "not specified"
    hw = cycle["harvest_window"]
    story = [
        Paragraph(escape(f"Crop plan: {cycle['crop']['name']['en']} — {land['name']}"), styles["Title"]),
        Paragraph(f"Area {m['area_acres']:.2f} acres ({m['area_ha']:.3f} ha) · centroid "
                  f"{m['centroid']['lat']:.5f}, {m['centroid']['lon']:.5f}", styles["Normal"]),
        Paragraph(f"Variety: {variety} · Method: {cycle['method'].replace('_', ' ')} · "
                  f"{cycle['anchor_type'].title()} date: {cycle['anchor_date']} · Status: {cycle['status']}",
                  styles["Normal"]),
        Paragraph(f"Expected harvest: {hw['expected']} (range {hw['earliest']} to {hw['latest']})", styles["Normal"]),
        Spacer(1, 6 * mm),
        Paragraph("Predicted growth stages (model output)", styles["Heading2"]),
        _table([["Stage", "Start (range)", "End (range)", "Source"]] + [
            [s["name"]["en"], f"{s['start']['expected']} ({s['start']['earliest']}–{s['start']['latest']})",
             f"{s['end']['expected']} ({s['end']['earliest']}–{s['end']['latest']})", s["source"]]
            for s in cycle["stages"]], [45 * mm, 50 * mm, 50 * mm, 30 * mm]),
        Spacer(1, 6 * mm),
        Paragraph("Tasks", styles["Heading2"]),
        _table([["Due", "Task", "Category", "Status"]] + [
            [str(t["due_date"]), Paragraph(escape(t["title"]), styles["BodyText"]), t["category"], t["status"]]
            for t in tasks], [25 * mm, 95 * mm, 30 * mm, 25 * mm]),
    ]
    if observations:
        story += [Spacer(1, 6 * mm), Paragraph("Field observations", styles["Heading2"]),
                  _table([["Date", "Stage", "Notes"]] + [
                      [str(o["observed_on"]), o.get("stage_key") or "",
                       Paragraph(escape(o.get("notes") or ""), styles["BodyText"])]
                      for o in observations], [25 * mm, 35 * mm, 115 * mm])]
    if inputs:
        total = sum(i.get("cost_inr") or 0 for i in inputs)
        story += [Spacer(1, 6 * mm), Paragraph(f"Inputs and costs (total ₹{total:,.0f})", styles["Heading2"]),
                  _table([["Date", "Type", "Product", "Qty", "Cost ₹"]] + [
                      [str(i["date"]), i["input_type"], i["product"],
                       f"{i.get('quantity') or ''} {i.get('unit') or ''}", f"{i.get('cost_inr') or 0:,.0f}"]
                      for i in inputs], [25 * mm, 25 * mm, 70 * mm, 25 * mm, 30 * mm])]
    model = cycle["model"]
    story += [
        Spacer(1, 6 * mm), Paragraph("Model and assumptions", styles["Heading2"]),
        Paragraph(f"{model['name']} v{model['version']} — stage dates are model estimates, not field "
                  "measurements. Field observations take precedence.", styles["BodyText"]),
    ] + [Paragraph(escape(f"• {a}"), styles["BodyText"]) for a in model["assumptions"] + model["missing_inputs"]]
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Boundary is a user drawing, not a legal survey. Weather data by Open-Meteo.com "
                           "(CC BY 4.0).", styles["Italic"]))
    doc.build(story)
    return buf.getvalue()
