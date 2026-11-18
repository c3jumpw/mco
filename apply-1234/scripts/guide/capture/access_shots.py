"""Screenshots of sharing a job: the access card, a reviewer's view and a full-access view."""
import json, re
from playwright.sync_api import sync_playwright
from fixtures import *
import guide_shots as G

CJOB = {"id": "j1", "title": JOB["title"], "status": "published", "questions": JOB["questions"], "rubric": JOB["rubric"],
        "activity": {"answer_min": 60, "answer_max": 180, "hidden_code": "lantern", "require_transcript": True},
        "access": {"role": "reviewer", "hide_contact": True, "see_files": True, "shortlisted_only": False, "notify": True, "can_move_stages": False},
        "candidates": 3, "scored_by_me": 1}
def masked(a):
    b = dict(a); b["email"] = ""; b.pop("visitor_id", None); return b
LIST = [dict(masked(x), answer_count=2, wrong_tries=w) for x, w in [(G.APPS[0], 2), (G.APPS[1], 0), (G.APPS[2], 5)]]
LIST = [{k: v for k, v in x.items() if k not in ("answers",)} for x in LIST]
REVIEWS = [{"id": "r1", "application_id": "a1", "reviewer_id": "u9", "reviewer_email": "dana@client.com", "scores": {}, "criteria": {"Clarity": 4}, "overall": 4, "recommendation": "yes", "updated_at": NOW},
           {"id": "r2", "application_id": "a1", "reviewer_id": "u1", "reviewer_email": ADMIN_EMAIL, "scores": {}, "criteria": {}, "overall": 5, "recommendation": "strong_yes", "updated_at": NOW},
           {"id": "r3", "application_id": "a2", "reviewer_id": "u1", "reviewer_email": ADMIN_EMAIL, "scores": {}, "criteria": {}, "overall": 3, "recommendation": "maybe", "updated_at": NOW}]
ACCESS = [{"id": "x1", "job_id": "j1", "email": "dana@client.com", "name": "Dana Lee", "user_id": "u9", "role": "reviewer", "hide_contact": True, "see_files": True, "shortlisted_only": False,
           "notify": True, "can_move_stages": False, "invited_by": ADMIN_EMAIL, "invited_at": NOW, "last_invite_at": NOW, "claimed_at": NOW},
          {"id": "x2", "job_id": "j1", "email": "sam@agency.com", "name": "", "user_id": None, "role": "editor", "hide_contact": False, "see_files": True, "shortlisted_only": False,
           "notify": True, "can_move_stages": True, "invited_by": ADMIN_EMAIL, "invited_at": NOW, "last_invite_at": None, "claimed_at": None}]
calls = []
MODE = {"who": "admin"}

def handler(route, request):
    url = request.url
    def ok(body, status=200, extra=None):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body), headers=extra or {})
    if "/rpc/hiring_claim_admin" in url: return ok(MODE["who"] == "admin")
    if "/rpc/hiring_claim_reviewer" in url: return ok({"jobs": 1, "editor": MODE["who"] == "editor"})
    if "/rpc/hiring_review_jobs" in url: return ok([CJOB])
    if "/rpc/hiring_review_apps" in url: return ok(LIST)
    if "/rpc/hiring_review_app" in url:
        return ok({"app": masked(G.APPS[0]), "events": EVENTS, "can_move_stages": False})
    if "/rpc/hiring_review_set_stage" in url: return ok(True)
    if "/functions/v1/hiring-notify" in url:
        calls.append(("notify", request.post_data))
        return route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}, content_type="application/json", body=json.dumps({"ok": True}))
    if "/rest/v1/hiring_reviewers" in url:
        if request.method == "POST":
            row = json.loads(request.post_data); calls.append(("insert", row))
            return ok(dict(ACCESS[0], **row, id="x3", user_id=None, claimed_at=None), 201)
        if request.method in ("PATCH", "DELETE"): calls.append((request.method, url[-40:])); return route.fulfill(status=204, body="")
        return ok(ACCESS)
    if "/rest/v1/hiring_reviews" in url and request.method == "GET": return ok(REVIEWS)
    if "/rest/v1/hiring_notes" in url and request.method == "GET":
        return ok([{"id": "n1", "application_id": "a1", "author_email": ADMIN_EMAIL, "kind": "note", "body": "Strong on vendor follow-ups.", "created_at": NOW},
                   {"id": "n2", "application_id": "a1", "author_email": "dana@client.com", "kind": "note", "body": "Loved how she explained the Friday report.", "created_at": NOW}])
    return G.handler(route, request)

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        errs = []
        def mk(w, h, who, mobile=False, user=None):
            MODE["who"] = who
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), handler)
            sess = json.loads(json.dumps(SESSION))
            if user: sess["user"] = dict(sess["user"], id=user[0], email=user[1])
            ctx.add_init_script(f"try{{localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(sess))});}}catch(e){{}}")
            ctx.add_init_script(NO_TOUR)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            return ctx, pg

        ctx, pg = mk(1280, 900, "admin")
        pg.goto(BASE + "/admin/jobs/j1?tab=overview"); pg.wait_for_timeout(1500)
        card = pg.locator("text=People with access to this job").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")
        card.scroll_into_view_if_needed()
        pg.get_by_role("button", name="Options").first.click(); pg.wait_for_timeout(300)
        card.screenshot(path=f"{SHOTS}/access-card.png")
        ctx.close()

        ctx, pg = mk(1280, 900, "client", user=("u9", "dana@client.com"))
        pg.goto(BASE + "/admin"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{SHOTS}/client-list.png", full_page=True)
        pg.get_by_text("Jane Rivera").first.click(); pg.wait_for_timeout(1500)
        pg.evaluate('''() => document.querySelectorAll('iframe').forEach(f => { const d = document.createElement('div'); d.style.cssText='position:absolute;inset:0;background:#1d1c22;display:grid;place-items:center;color:#cfcbc2;font:500 14px Inter,system-ui'; d.textContent='Loom video plays here'; f.parentElement.style.position='relative'; f.replaceWith(d); })''')
        pg.screenshot(path=f"{SHOTS}/client-candidate.png", full_page=True)
        ctx.close()

        ctx, pg = mk(1280, 900, "editor", user=("u8", "sam@agency.com"))
        pg.goto(BASE + "/admin"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{SHOTS}/editor-jobs.png")
        ctx.close()
        b.close()
        print("access shots, errors:", errs[:6])

if __name__ == "__main__":
    run()
