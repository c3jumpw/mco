"""Checks offer letters end to end against a mock: prepare, preview, send, sign (drawn and typed), decline,
and the interview records on a candidate's profile. Screenshots go to SHOTS/test-offer-*.png."""
import json, re, copy, sys
from playwright.sync_api import sync_playwright
from fixtures import *
import run as base

errors, calls = [], []
offers = {}          # id -> row
COMPANY = {"offer_defaults": {}}
CHATS = []           # hiring_chat rows
JOB_SETTINGS = {}
TOKEN = "tok_" + "x" * 30

def cors(route, status=200, body=None):
    route.fulfill(status=status, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"},
                  content_type="application/json", body=json.dumps(body if body is not None else {}))

def public(o, app):
    f = o["fields"]
    pay = f"{f.get('pay_currency','')} {f.get('pay_amount','')} {f.get('pay_period','')}".strip()
    return {"id": o["id"], "status": o["status"], "expired": o.get("_expired", False), "company": f.get("company", ""), "company_address": f.get("company_address", ""),
            "position": f.get("position", ""), "summary": {"position": f.get("position",""), "employment_type": f.get("employment_type",""), "start_date": f.get("start_date",""),
            "pay": pay, "pay_schedule": f.get("pay_schedule",""), "schedule": f.get("schedule",""), "location": f.get("location",""), "expires": f.get("expires","")},
            "manager": {"name": f.get("manager_name",""), "title": f.get("manager_title",""), "email": f.get("manager_email",""), "phone": f.get("manager_phone","")},
            "candidate": {"name": app["name"], "email": app["email"]}, "letter": o["final_letter"], "terms": o["final_terms"],
            "attachments": [{"id": i, "name": a["name"], "size": a.get("size"), "type": a.get("type", "")} for i, a in enumerate(o["attachments"])],
            "sent_at": o["sent_at"], "signed_at": o["signed_at"], "signer_name": o["signer_name"], "declined_at": o["declined_at"],
            "signature_kind": (o.get("signature") or {}).get("kind"), "pdf": bool(o.get("pdf_path")), "doc_hash": o.get("doc_hash"),
            "messages": [{"id": c["id"], "from": "you" if c["sender"] == "candidate" else "team", "name": "" if c["sender"] == "candidate" else (c["author_name"] or f.get("company", "")),
                          "body": c["body"], "at": c["created_at"]} for c in CHATS if c["application_id"] == o["application_id"]]}

def fill(text, f, app):
    """The same rules as fillOffer in offer.ts: dates spelled out, and a line whose fill-in is empty is left out."""
    import datetime
    def day(d):
        try: x = datetime.date.fromisoformat(d or ""); return f"{x:%A}, {x:%B} {x.day}, {x.year}"
        except ValueError: return ""
    t = lambda k: (f.get(k) or "").strip()
    v = {"first": app["name"].split()[0], "candidate_name": app["name"], "start_date": day(f.get("start_date")), "expires": day(f.get("expires")),
         "pay": " ".join(x for x in [t("pay_currency"), t("pay_amount"), t("pay_period")] if x),
         "manager_contact": " or ".join(x for x in [t("manager_email"), t("manager_phone")] if x),
         "reports_to": ", ".join(x for x in [t("manager_name"), t("manager_title")] if x),
         "signoff_title": ", ".join(x for x in [t("manager_title"), t("company")] if x)}
    for k in ("company", "company_address", "position", "employment_type", "location", "schedule", "pay_schedule", "benefits",
              "manager_name", "manager_title", "manager_email", "manager_phone"):
        v[k] = t(k)
    out = []
    for line in text.split("\n"):
        keys = [k for k in re.findall(r"\{(\w+)\}", line) if k in v]
        if any(not v[k] for k in keys): continue
        out.append(re.sub(r"\{(\w+)\}", lambda m: v.get(m.group(1), m.group(0)), line))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()

def handler(route, request):
    url, method = request.url, request.method
    single = "vnd.pgrst.object" in request.headers.get("accept", "")
    def ok(body, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
    if "/functions/v1/hiring-offer" in url:
        if method == "OPTIONS": return cors(route)
        b = json.loads(request.post_data or "{}")
        calls.append(b)
        a = b.get("action")
        if a == "reply":
            o = offers.get(b.get("offer_id"))
            CHATS.append({"id": f"c{len(CHATS)+1}", "application_id": o["application_id"], "job_id": o["job_id"], "offer_id": o["id"], "sender": "team",
                          "author_email": ADMIN_EMAIL, "author_name": "", "body": b["body"], "meta": {}, "emailed": ["jane@example.com"], "read_at": None, "read_by": None, "created_at": NOW})
            for c in CHATS:
                if c["application_id"] == o["application_id"] and c["sender"] == "candidate": c["read_at"] = NOW
            return cors(route, 200, {"ok": True, "emailed": True})
        if a in ("send", "resend", "withdraw", "rebuild_pdf"):
            o = offers.get(b.get("offer_id"))
            if not o: return cors(route, 404, {"ok": False, "error": "not_found"})
            if a == "send":
                o.update(status="sent", token=TOKEN, final_letter=fill(o["letter"], o["fields"], APP), final_terms=fill(o["terms"], o["fields"], APP),
                         doc_hash="ab" * 32, sent_at=NOW, sent_by=ADMIN_EMAIL, expires_at=o["fields"]["expires"] + "T23:59:59Z",
                         events=[{"at": NOW, "type": "sent", "by": ADMIN_EMAIL, "ip": "198.51.100.20"}, {"at": NOW, "type": "emailed", "note": APP["email"]}])
                return cors(route, 200, {"ok": True, "link": f"https://www.apply1234.com/offer/{TOKEN}", "emailed": True})
            if a == "withdraw":
                o.update(status="withdrawn", withdrawn_at=NOW); return cors(route, 200, {"ok": True})
            return cors(route, 200, {"ok": True})
        o = next((x for x in offers.values() if x.get("token") == b.get("token")), None)
        if not o: return cors(route, 404, {"ok": False, "error": "not_found"})
        if a == "view":
            o["views"] = o.get("views", 0) + 1
            if o["status"] == "sent": o.update(status="viewed", viewed_at=NOW)
            return cors(route, 200, {"ok": True, "offer": public(o, APP)})
        if a == "sign":
            if not (b.get("consent") and b.get("read")): return cors(route, 400, {"ok": False, "error": "consent"})
            sig = b.get("signature") or {}
            if sig.get("kind") == "drawn" and not str(sig.get("png", "")).startswith("data:image/png;base64,"): return cors(route, 400, {"ok": False, "error": "signature"})
            o.update(status="signed", signed_at=NOW, signer_name=b["name"], signature={"kind": sig.get("kind"), "path": "j1/a1/offers/x/signature.png"},
                     signer_meta={"ip": "203.0.113.7", "ua": "Mozilla/5.0 (iPhone) Safari", "tz": b.get("tz")}, pdf_path="j1/a1/offers/x/signed-offer.pdf")
            o["events"].append({"at": NOW, "type": "signed", "ip": "203.0.113.7"})
            return cors(route, 200, {"ok": True, "pdf": True, "emailed": True})
        if a == "message":
            if not (b.get("body") or "").strip(): return cors(route, 400, {"ok": False, "error": "empty"})
            CHATS.append({"id": f"c{len(CHATS)+1}", "application_id": o["application_id"], "job_id": o["job_id"], "offer_id": o["id"], "sender": "candidate",
                          "author_email": APP["email"], "author_name": APP["name"], "body": b["body"].strip(), "meta": {}, "emailed": [], "read_at": None, "read_by": None, "created_at": NOW})
            return cors(route, 200, {"ok": True, "messages": public(o, APP)["messages"]})
        if a == "decline":
            o.update(status="declined", declined_at=NOW, decline_reason=b.get("reason")); return cors(route, 200, {"ok": True})
        if a == "file": return cors(route, 200, {"ok": True, "url": "https://example.com/file.pdf"})
        return cors(route, 400, {"ok": False, "error": "unknown_action"})
    if "/storage/v1/object/sign/" in url: return ok({"signedURL": "/object/sign/hiring-team/x?token=t"})
    if "/storage/v1/object/hiring-team" in url:
        calls.append({"upload": url.split("hiring-team/")[-1]}); return ok({"Key": "hiring-team/x", "Id": "1"})
    if "/rest/v1/hiring_offers" in url:
        if method == "POST":
            row = json.loads(request.post_data or "{}")
            row = row[0] if isinstance(row, list) else row
            oid = f"0ff0000{len(offers)}-0000-4000-8000-00000000000{len(offers)}"
            full = {"id": oid, "status": "draft", "token": None, "final_letter": None, "final_terms": None, "doc_hash": None, "expires_at": None,
                    "sent_at": None, "sent_by": None, "sent_meta": None, "viewed_at": None, "views": 0, "signed_at": None, "signer_name": None,
                    "signature": None, "signer_meta": None, "declined_at": None, "decline_reason": None, "withdrawn_at": None, "pdf_path": None,
                    "events": [], "created_by": ADMIN_EMAIL, "created_at": NOW, "updated_at": NOW, **row}
            offers[oid] = full
            return ok(full if single else [full], 201)
        m = re.search(r"id=eq\.([\w-]+)", url)
        if method == "PATCH":
            patch = json.loads(request.post_data or "{}")
            calls.append({"patch_offer": patch})
            if m and m.group(1) in offers: offers[m.group(1)].update(patch)
            return route.fulfill(status=204, body="")
        if method == "DELETE":
            if m: offers.pop(m.group(1), None)
            return route.fulfill(status=204, body="")
        if m and "application_id" not in url:
            o = offers.get(m.group(1))
            return ok(o if single else ([o] if o else []))
        am = re.search(r"application_id=eq\.([\w-]+)", url)
        rows = sorted([o for o in offers.values() if not am or o["application_id"] == am.group(1)], key=lambda x: x["created_at"], reverse=True)
        return ok(rows[0] if single and rows else rows)
    if "/rest/v1/hiring_applications" in url and method == "PATCH":
        calls.append({"patch_app": json.loads(request.post_data or "{}")})
        return route.fulfill(status=204, body="")
    if "/rest/v1/hiring_chat" in url:
        if method == "PATCH":
            calls.append({"patch_chat": json.loads(request.post_data or "{}")})
            for c in CHATS:
                if c["sender"] == "candidate" and not c["read_at"]: c["read_at"] = NOW
            return route.fulfill(status=204, body="")
        if method == "HEAD" or "count=exact" in request.headers.get("prefer", ""):
            n = len([c for c in CHATS if c["sender"] == "candidate" and not c["read_at"]])
            return route.fulfill(status=200, headers={"content-range": f"0-0/{n}", "Access-Control-Expose-Headers": "content-range", "Access-Control-Allow-Origin": "*"}, content_type="application/json", body="[]")
        am = re.search(r"application_id=eq\.([\w-]+)", url)
        rows = [dict(c, hiring_applications={"name": APP["name"] if c["application_id"] == "a1" else "Marcus Lee"}) for c in CHATS if not am or c["application_id"] == am.group(1)]
        if "order=created_at.desc" in url: rows = list(reversed(rows))
        return ok(rows)
    if "/rest/v1/hiring_company" in url:
        if method == "PATCH":
            body = json.loads(request.post_data or "{}"); calls.append({"patch_company": body}); COMPANY.update(body)
            return route.fulfill(status=204, body="")
        return ok(COMPANY if single else [COMPANY])
    if "/rest/v1/hiring_jobs" in url and method == "PATCH":
        body = json.loads(request.post_data or "{}")
        calls.append({"patch_job": body})
        if "settings" in body: JOB_SETTINGS.clear(); JOB_SETTINGS.update(body["settings"])
        return route.fulfill(status=204, body="")
    if "/rest/v1/hiring_jobs" in url and method == "GET":
        j = dict(JOB_O, settings=dict(JOB_SETTINGS))
        return ok(j if single else [j])
    return base.handler(route, request)

JOB_O = dict(copy.deepcopy(JOB), posting=JOB["posting"] + "\n\n## Details\n- **Location:** Remote\n- **Schedule:** Monday to Friday, flexible hours\n- **Pay:** TBD")

def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: errors.append("FAIL " + label)

def main(b):
    def mk(w, h, admin=False, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), handler)
        ctx.add_init_script(NO_TOUR)
        if admin:
            ctx.add_init_script(f"try {{ localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(SESSION))}); localStorage.setItem('a1234_admin','1'); }} catch (e) {{}}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text[:200]}"))
        return ctx, pg

    # ── Prepare and send ──
    ctx, pg = mk(1440, 1000, admin=True)
    pg.goto(f"{BASE}/admin/candidates/a1"); pg.wait_for_timeout(1500)
    check(pg.get_by_text("Prepare an offer").count() == 1, "profile shows Prepare an offer")
    check(pg.get_by_text("Recordings and transcripts").count() == 1, "profile shows interview records section")
    pg.get_by_role("button", name="Prepare an offer").click(); pg.wait_for_timeout(1200)
    check("/offer/" in pg.url, "prepare opens the offer editor")
    check(pg.get_by_text("Offer for Jane Rivera").count() >= 1, "editor title names the candidate")
    oid = next(iter(offers))
    f0 = offers[oid]["fields"]
    check(f0.get("position") == JOB["title"] and f0.get("location") == "Remote" and "Monday" in f0.get("schedule", ""), "defaults come from the job posting")
    check(f0.get("pay_amount") == "" , "pay TBD in posting is not copied")
    def field(label): return pg.locator("label", has_text=re.compile(rf"^{label}")).locator("input, select").first
    field("Company name").fill("Brand Craftsman")
    field("Engagement").fill("Independent contractor, full-time hours")
    field("Start date").fill("2026-12-01")
    field("Pay").fill("6.00")
    field("Paid").fill("twice a month")
    field("Email").fill("alex@brand.test")
    # manager name is the first "Name" field inside the Hiring manager card
    field("Name").fill("Alex Rivera")
    field("Title").fill("CEO")
    pg.wait_for_timeout(1200)
    preview = pg.locator("article").first
    check("Brand Craftsman" in preview.inner_text() and "USD 6.00 per hour" in preview.inner_text(), "preview fills company and pay")
    check("Dear Jane" in preview.inner_text(), "preview greets the candidate by first name")
    check(pg.locator("article mark").count() > 0, "preview highlights [notes] still to replace")
    check(any("patch_offer" in c for c in calls), "draft autosaves")
    pg.screenshot(path=f"{SHOTS}/test-offer-editor.png", full_page=False)
    pg.get_by_role("button", name="Review and send").click(); pg.wait_for_timeout(600)
    check(pg.get_by_text("Before you send").count() == 1 and pg.get_by_text(re.compile("these notes in the letter or terms")).count() == 1, "send is blocked while notes remain")
    pg.get_by_role("button", name="Back to the offer").click()
    terms = pg.locator("textarea").nth(1)
    terms.fill("1. **Engagement.** You are an independent contractor.\n2. **Pay.** {pay}, paid {pay_schedule}.\n3. **Ending.** Either side may end this with 14 days' written notice.")
    pg.wait_for_timeout(1000)
    # one file attached
    pg.locator("input[type=file]").first.set_input_files(files=[{"name": "NDA.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 test"}])
    pg.wait_for_timeout(1000)
    check(any("upload" in c and "/offers/" in c["upload"] and "/attachments/" in c["upload"] for c in calls), "attachment uploads under the offer folder")
    check(pg.get_by_text("NDA.pdf").count() >= 1, "attachment listed")
    pg.get_by_role("button", name="Review and send").click(); pg.wait_for_timeout(600)
    check(pg.get_by_text("Send the offer to Jane Rivera?").count() == 1, "send modal asks to confirm")
    check(pg.get_by_text(re.compile("Brand Craftsman via apply1234")).count() == 1, "modal shows the From line")
    check(pg.get_by_label(re.compile("CC the hiring manager")).is_checked(), "hiring manager is CC'd by default")
    also = pg.locator("label", has_text="Also CC").locator("input")
    also.fill("ops@brand.test, nope")
    check(pg.get_by_role("button", name="Send offer").is_disabled() and pg.get_by_text(re.compile("Check nope")).count() == 1, "a bad CC address blocks sending")
    also.fill("ops@brand.test")
    check(pg.get_by_text("alex@brand.test, ops@brand.test").count() == 1, "CC list shown")
    pg.screenshot(path=f"{SHOTS}/test-offer-send.png")
    pg.get_by_role("button", name="Send offer").click(); pg.wait_for_timeout(1500)
    send = next((c for c in calls if c.get("action") == "send"), {})
    check(send.get("cc") == ["alex@brand.test", "ops@brand.test"], f"CC sent to the function: {send.get('cc')}")
    check(offers[oid]["status"] == "sent", "send calls the function")
    check(any("patch_job" in c and c["patch_job"]["settings"]["offer_defaults"]["company"] == "Brand Craftsman" and "start_date" not in c["patch_job"]["settings"]["offer_defaults"] for c in calls), "defaults remembered on the job without person-specific fields")
    check(pg.get_by_text("Copy signing link").count() == 1 and pg.get_by_text("Event log").count() == 1, "sent view shows link and event log")
    pg.screenshot(path=f"{SHOTS}/test-offer-sent.png")
    ctx.close()

    # ── Candidate signs (drawn) ──
    ctx, pg = mk(1280, 900)
    pg.goto(f"{BASE}/offer/{TOKEN}"); pg.wait_for_timeout(1500)
    check(pg.get_by_text("You have an offer.").count() == 1, "candidate sees the offer")
    check(pg.locator("article").inner_text().count("Brand Craftsman") >= 1, "letter shows the company")
    btn = pg.get_by_role("button", name="Sign and accept the offer")
    check(btn.is_disabled(), "sign is disabled until ready")
    pg.screenshot(path=f"{SHOTS}/test-offer-candidate-top.png")
    canvas = pg.locator("canvas")
    canvas.scroll_into_view_if_needed()
    box = canvas.bounding_box()
    pg.mouse.move(box["x"] + 40, box["y"] + 90); pg.mouse.down()
    for i in range(1, 30): pg.mouse.move(box["x"] + 40 + i * 12, box["y"] + 90 - (30 if i % 6 < 3 else -10) * (i % 3) / 2)
    pg.mouse.up()
    for c in pg.locator("input[type=checkbox]").all(): c.check()
    pg.wait_for_timeout(300)
    check(btn.is_enabled(), "sign enabled after drawing and ticking")
    pg.screenshot(path=f"{SHOTS}/test-offer-candidate-sign.png", full_page=False)
    btn.click(); pg.wait_for_timeout(1500)
    sign = next((c for c in calls if c.get("action") == "sign"), {})
    check(sign.get("signature", {}).get("kind") == "drawn" and sign["signature"].get("png", "").startswith("data:image/png;base64,"), "drawn signature sent as PNG")
    check(bool(sign.get("tz")), "time zone sent with the signature")
    check(pg.get_by_text(re.compile("Signed by Jane Rivera")).count() == 1, "signed banner shows")
    check(pg.get_by_text("Download signed offer (PDF)").count() == 1, "signed PDF download offered")
    pg.screenshot(path=f"{SHOTS}/test-offer-candidate-signed.png")
    ctx.close()

    # ── Profile shows the signed record ──
    ctx, pg = mk(1440, 1000, admin=True)
    pg.goto(f"{BASE}/admin/candidates/a1"); pg.wait_for_timeout(1500)
    check(pg.get_by_text(re.compile("Signed by Jane Rivera")).count() >= 1, "profile shows signed offer")
    for t in ["Signed offer (PDF)", "Signature image", "Audit trail", "NDA.pdf"]:
        check(pg.get_by_text(t, exact=True).count() >= 1, f"profile lists {t}")
    with pg.expect_download() as dl:
        pg.locator("div.rounded-xl", has=pg.get_by_text("Audit trail", exact=True)).get_by_role("button", name="Download").click()
    data = json.loads(open(dl.value.path()).read())
    check(data["signed"]["ip"] == "203.0.113.7" and data["document_sha256"] == "ab" * 32, "audit trail has IP and fingerprint")
    # interview records
    pg.get_by_role("button", name="+ Add a recording, transcript or file").click()
    pg.locator("input[type=url]").fill("https://zoom.us/rec/share/abc")
    pg.get_by_role("button", name="Add recording").click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="+ Add a recording, transcript or file").click()
    pg.get_by_role("button", name="Transcript", exact=True).click()
    pg.locator("label", has_text="Transcript text").locator("textarea").fill("Alex: Tell me about yourself.\nJane: I run operations for a small agency.")
    pg.get_by_role("button", name="Add transcript").click(); pg.wait_for_timeout(600)
    recs = [c["patch_app"]["interview_records"] for c in calls if "patch_app" in c and "interview_records" in c["patch_app"]]
    check(len(recs) >= 2 and recs[-1][0]["url"] == "https://zoom.us/rec/share/abc" and recs[-1][1]["kind"] == "transcript", "interview records saved")
    check(pg.get_by_text(re.compile("Read the transcript")).count() == 1, "transcript readable on the profile")
    pg.get_by_text("Recordings and transcripts").scroll_into_view_if_needed()
    pg.screenshot(path=f"{SHOTS}/test-offer-profile.png", full_page=True)
    ctx.close()

    # ── Company defaults, the job's Offer tab, and an offer that starts from them ──
    JOB_SETTINGS.clear()      # start this job fresh (the earlier send saved its details)
    ctx, pg = mk(1280, 1000, admin=True)
    pg.goto(f"{BASE}/admin/settings"); pg.wait_for_timeout(1200)
    card = pg.locator("#offer-defaults").locator("xpath=..")
    card.get_by_role("button", name="Edit").click(); pg.wait_for_timeout(300)
    card.locator("label", has_text=re.compile("^Company name")).locator("input").fill("Kestrel Studio")
    card.locator("label", has_text=re.compile("^Name")).locator("input").fill("Rae Morgan")
    card.locator("label", has_text=re.compile("^Email")).locator("input").fill("rae@kestrel.test")
    card.locator("label", has_text=re.compile("^Engagement")).locator("input").fill("Independent contractor")
    card.locator("label", has_text=re.compile("^Paid")).locator("input").fill("every two weeks")
    pg.get_by_role("button", name="Save offer defaults").click(); pg.wait_for_timeout(600)
    saved = next((c["patch_company"] for c in calls if "patch_company" in c), {})
    check(saved.get("offer_defaults", {}).get("company") == "Kestrel Studio" and saved["offer_defaults"].get("manager_email") == "rae@kestrel.test", "Settings saves the company's offer defaults")
    pg.screenshot(path=f"{SHOTS}/test-offer-company.png", full_page=True)
    pg.goto(f"{BASE}/admin/jobs/j1?tab=offer"); pg.wait_for_timeout(1200)
    check(pg.locator("label", has_text=re.compile("^Company name")).locator("input").get_attribute("placeholder") == "Kestrel Studio", "job Offer tab shows the company's values as placeholders")
    pg.locator("label", has_text=re.compile("^Starting pay")).locator("input").fill("120.00")
    pg.locator("label", has_text=re.compile("^Provisional period")).locator("input").fill("90 days")
    pg.locator("label", has_text=re.compile("^Counted")).locator("select").select_option("per week")
    pg.wait_for_timeout(1500)
    od = JOB_SETTINGS.get("offer_defaults", {})
    check(od.get("pay_amount") == "120.00" and od.get("provisional_period") == "90 days" and od.get("pay_period") == "per week" and "company" not in od, f"job saves only its own choices: {od}")
    pg.screenshot(path=f"{SHOTS}/test-offer-jobtab.png", full_page=True)
    # Marcus (a2) gets an offer that starts from company + job
    pg.goto(f"{BASE}/admin/candidates/a2"); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name="Prepare an offer").click(); pg.wait_for_timeout(1200)
    new = [o for o in offers.values() if o["application_id"] == "a2"][-1]
    f = new["fields"]
    check(f.get("company") == "Kestrel Studio" and f.get("manager_name") == "Rae Morgan" and f.get("pay_amount") == "120.00"
          and f.get("pay_period") == "per week" and f.get("provisional_period") == "90 days" and f.get("pay_schedule") == "every two weeks", f"offer starts from company + job: {f}")
    check(pg.locator("details[open]").count() == 0, "company, role and manager are folded away when complete")
    check(pg.get_by_text("For Marcus", exact=True).count() == 1, "the offer opens on what's specific to the person")
    check("your first 90 days" in pg.locator("article").inner_text(), "preview shows the provisional period")
    pg.screenshot(path=f"{SHOTS}/test-offer-layered.png")
    ctx.close()

    # ── Messages: the candidate writes from the offer page, the team replies on the profile ──
    ctx, pg = mk(1280, 900)
    pg.goto(f"{BASE}/offer/{TOKEN}#messages"); pg.wait_for_timeout(1500)
    check(pg.locator("#messages").count() == 1, "offer page has a messages section")
    pg.locator("#messages textarea").fill("Could I start on December 8th instead?")
    pg.get_by_role("button", name="Send message").click(); pg.wait_for_timeout(800)
    sentm = [c for c in calls if c.get("action") == "message"]
    check(sentm and sentm[-1]["body"] == "Could I start on December 8th instead?", "candidate message sent to the function")
    check(pg.locator("#messages").get_by_text("Could I start on December 8th instead?").count() == 1 and pg.get_by_text(re.compile("Sent. We’ll email you")).count() == 1, "message shows in the conversation")
    pg.locator("#messages").screenshot(path=f"{SHOTS}/test-offer-messages-candidate.png")
    ctx.close()
    ctx, pg = mk(1280, 1000, admin=True)
    pg.goto(f"{BASE}/admin/inbox"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{SHOTS}/test-offer-inbox.png", full_page=True)
    check(pg.get_by_text("Conversations with candidates", exact=True).count() == 1 and pg.get_by_text("1 new", exact=True).count() == 1, "Inbox lists the conversation as new")
    check(pg.locator("nav a[href='/admin/inbox'] span").filter(has_text=re.compile(r"^1$")).count() >= 1, "the Inbox badge counts the unread candidate message")
    pg.get_by_role("link", name=re.compile("Jane Rivera")).first.click(); pg.wait_for_timeout(1500)
    check("/admin/candidates/a1" in pg.url, "Inbox opens the candidate's profile")
    conv = pg.locator("#messages").locator("xpath=..")
    check(conv.get_by_text("Could I start on December 8th instead?").count() == 1, "profile shows the candidate's message")
    check(any("patch_chat" in c for c in calls), "opening the conversation marks it read")
    conv.locator("textarea").fill("Yes, the 8th works. I'll send an updated offer today.")
    conv.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1000)
    rep_calls = [c for c in calls if c.get("action") == "reply"]
    check(rep_calls and rep_calls[-1]["offer_id"] == oid, "reply goes through the function for the latest sent offer")
    check(conv.get_by_text("Yes, the 8th works. I'll send an updated offer today.").count() == 1, "reply shows in the conversation")
    conv.screenshot(path=f"{SHOTS}/test-offer-messages-team.png")
    ctx.close()

    # ── Typed signature and decline, on a phone ──
    o = offers[oid]
    o2 = dict(copy.deepcopy(o), id="0ff00009-0000-4000-8000-000000000009", status="sent", token=TOKEN + "b", signed_at=None, signer_name=None, pdf_path=None, signature=None)
    offers[o2["id"]] = o2
    ctx, pg = mk(390, 844, mobile=True)
    pg.goto(f"{BASE}/offer/{TOKEN}b"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{SHOTS}/test-offer-mobile-top.png")
    pg.get_by_role("button", name="Type", exact=True).click()
    for c in pg.locator("input[type=checkbox]").all(): c.check()
    pg.locator("#sign").scroll_into_view_if_needed()
    pg.screenshot(path=f"{SHOTS}/test-offer-mobile-sign.png")
    pg.get_by_role("button", name="Sign and accept the offer").click(); pg.wait_for_timeout(1200)
    sign = [c for c in calls if c.get("action") == "sign"][-1]
    check(sign["signature"] == {"kind": "typed", "text": "Jane Rivera"}, "typed signature sent")
    ctx.close()

    o3 = dict(copy.deepcopy(o), id="0ff00008-0000-4000-8000-000000000008", status="sent", token=TOKEN + "c", signed_at=None, signer_name=None, pdf_path=None)
    offers[o3["id"]] = o3
    ctx, pg = mk(390, 844, mobile=True)
    pg.goto(f"{BASE}/offer/{TOKEN}c"); pg.wait_for_timeout(1500)
    pg.get_by_text("Decline the offer").click()
    pg.get_by_placeholder("Optional").fill("Accepted another role.")
    pg.get_by_role("button", name="Decline", exact=True).click(); pg.wait_for_timeout(1200)
    check(o3["status"] == "declined" and o3["decline_reason"] == "Accepted another role.", "decline sends the note")
    check(pg.get_by_text("You declined this offer.").count() == 1, "declined state shows")
    ctx.close()

    o4 = dict(copy.deepcopy(o), id="0ff00007-0000-4000-8000-000000000007", status="sent", token=TOKEN + "d", _expired=True)
    offers[o4["id"]] = o4
    ctx, pg = mk(390, 844, mobile=True)
    pg.goto(f"{BASE}/offer/{TOKEN}d"); pg.wait_for_timeout(1500)
    check(pg.get_by_text("This offer has expired.").count() == 1 and pg.locator("#sign").count() == 0, "expired offer can't be signed")
    pg.goto(f"{BASE}/offer/nope_nope_nope_nope_nope_nope"); pg.wait_for_timeout(1200)
    check(pg.get_by_text("Offer not found.").count() == 1, "bad link explains itself")
    ctx.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        main(b)
        b.close()
    print("\n".join(errors) if errors else "ALL PASS")
    sys.exit(1 if errors else 0)
