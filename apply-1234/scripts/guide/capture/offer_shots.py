"""Offer letters and interview records: runs the offer checks, then takes the guide and tour pictures.

  offer-editor      the offer editor with its live preview
  offer-send        the send window, with CC
  offer-record      a signed offer: the document, its record, files and event log
  interview-records recordings and transcripts on a candidate's page
  cand-14-offer     the candidate's offer page on a phone
  cand-15-sign      signing on a phone
"""
import copy, json, re
from playwright.sync_api import sync_playwright
from fixtures import *
import offers_test as T

OUT = SHOTS
RECORDS = [
    {"id": "r1", "kind": "recording", "label": "Interview, Nov 18 (Zoom)", "url": "https://zoom.us/rec/share/example", "added_at": NOW, "added_by": ADMIN_EMAIL},
    {"id": "r2", "kind": "transcript", "label": "Interview transcript", "text": "Alex: Thanks for joining. Tell me about the last schedule you ran.\nJane: I kept a weekly calendar for a team of six and the vendor deliveries around it...", "added_at": NOW, "added_by": ADMIN_EMAIL},
    {"id": "r3", "kind": "file", "label": "Interview notes.pdf", "path": "j1/a1/interview/notes.pdf", "name": "Interview notes.pdf", "size": 84000, "added_at": NOW, "added_by": ADMIN_EMAIL},
]
APP_R = dict(APP, interview_records=RECORDS, interview_at="2026-11-18T15:00:00Z", stage="offer")

def handler(route, request):
    url = request.url
    if request.method == "GET" and "/rest/v1/hiring_applications" in url and "id=eq.a1" in url:
        single = "vnd.pgrst.object" in request.headers.get("accept", "")
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(APP_R if single else [APP_R]))
    return T.handler(route, request)

TERMS = """1. **Engagement.** You are engaged as an independent contractor. You are responsible for your own taxes.
2. **Provisional period.** Your first 90 days are a provisional period.
3. **Pay.** You will be paid {pay}. Payments are made {pay_schedule}.
4. **Confidentiality.** You will keep non-public information about {company} confidential, during and after your time with us.
5. **Ending the arrangement.** Either side may end this arrangement with 14 days' written notice."""

def main(b):
    T.main(b)                      # the checks; leaves a signed offer and others behind in T.offers
    signed_id = next(k for k, v in T.offers.items() if v["status"] == "signed" and v.get("attachments"))
    base = T.offers[signed_id]
    draft = dict(copy.deepcopy(base), id="0ff000d0-0000-4000-8000-0000000000d0", application_id="a2", status="draft", token=None,
                 final_letter=None, final_terms=None, sent_at=None, signed_at=None, pdf_path=None, events=[], terms=TERMS,
                 fields=dict(base["fields"], cc=[]))
    T.offers[draft["id"]] = draft
    open_offer = dict(copy.deepcopy(base), id="0ff000e0-0000-4000-8000-0000000000e0", status="sent", token=T.TOKEN + "g",
                      final_terms=base["final_terms"], signed_at=None, signer_name=None, pdf_path=None, signature=None)
    T.offers[open_offer["id"]] = open_offer

    def mk(w, h, admin=False, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
        ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), handler)
        ctx.add_init_script(NO_TOUR)
        if admin:
            ctx.add_init_script(f"try {{ localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(SESSION))}); localStorage.setItem('a1234_admin','1'); }} catch (e) {{}}")
        return ctx, ctx.new_page()

    # Writing and sending
    ctx, pg = mk(1280, 860, admin=True)
    pg.goto(f"{BASE}/admin/candidates/a2/offer/{draft['id']}"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/offer-editor.png")
    pg.get_by_role("button", name="Review and send").click(); pg.wait_for_timeout(700)
    pg.locator("label", has_text="Also CC").locator("input").fill("ops@brandcraftsman.test")
    pg.wait_for_timeout(200)
    pg.locator("div.fixed.inset-0 div.rise").first.screenshot(path=f"{OUT}/offer-send.png")
    ctx.close()

    # A signed offer's record
    ctx, pg = mk(1280, 900, admin=True)
    pg.goto(f"{BASE}/admin/candidates/a1/offer/{signed_id}"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/offer-record.png")
    # Interview records on the candidate's page
    pg.goto(f"{BASE}/admin/candidates/a1"); pg.wait_for_timeout(1500)
    pg.get_by_text("Read the transcript").first.click(); pg.wait_for_timeout(200)
    rec = pg.locator("div.pt-4.border-t", has=pg.get_by_text("Recordings and transcripts", exact=True)).first
    rec.scroll_into_view_if_needed()
    rec.screenshot(path=f"{OUT}/interview-records.png")
    ctx.close()

    # The candidate's side, on a phone
    ctx, pg = mk(390, 844, mobile=True)
    pg.goto(f"{BASE}/offer/{open_offer['token']}"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/cand-14-offer.png")
    pg.locator("#sign").scroll_into_view_if_needed()
    box = pg.locator("canvas").bounding_box()
    pg.mouse.move(box["x"] + 30, box["y"] + 100); pg.mouse.down()
    pts = [(60, 60), (85, 110), (110, 70), (140, 105), (170, 65), (200, 100), (240, 80), (280, 95)]
    for x, y in pts: pg.mouse.move(box["x"] + x, box["y"] + y, steps=6)
    pg.mouse.up()
    for c in pg.locator("input[type=checkbox]").all(): c.check()
    pg.evaluate("document.getElementById('sign').scrollIntoView({block: 'start'}); window.scrollBy(0, -64)")
    pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-15-sign.png")
    ctx.close()

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        main(b); b.close()
    print("\n".join(T.errors) if T.errors else "offer checks: ALL PASS")
    return not T.errors

if __name__ == "__main__":
    import sys
    sys.exit(0 if run() else 1)
