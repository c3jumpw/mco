import json, re, os
from playwright.sync_api import sync_playwright
from fixtures import *
import new as N

OUT = SHOTS
JOBX = dict(JOB, sources=[{"id":"s1","label":"LinkedIn","code":"lnk","active":True},{"id":"s2","label":"Indeed","code":"ind","active":True}],
            settings={"invite_subject":"Next step: interview for {role}","invite_body":"Hi {first},\n\nThank you for completing the activity...","reject_subject":"Your application for {role}","reject_body":"Hi {first}, ..."})
APPS = [dict(N.APPX, metrics=dict(N.APPX["metrics"], source="lnk", source_label="LinkedIn")),
        dict(APP2, stage="shortlisted"),
        dict(APP, id="a3", name="Priya Shah", email="priya@example.com", stage="interview", interview_at="2026-11-10T15:00:00Z", tags=[], submitted_at="2026-11-05T16:20:00Z",
             flags={"all_loom_links":True,"lengths_in_range":True,"transcripts_ok":True,"hidden_code_ok":True,"duplicate_email":False}),
        dict(APP, id="a4", name="Tom Becker", email="tom@example.com", stage="rejected", tags=[], submitted_at="2026-11-03T12:00:00Z",
             flags={"all_loom_links":True,"lengths_in_range":None,"transcripts_ok":False,"hidden_code_ok":False,"duplicate_email":False})]

def handler(route, request):
    url = request.url
    def ok(body, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
    single = "vnd.pgrst.object" in request.headers.get("accept", "")
    if request.method == "GET" and "/rest/v1/hiring_jobs" in url and "select=id%2Ctitle%2Cslug%2Csources" not in url.replace(",", "%2C").replace("%20", ""):
        return ok(JOBX if single else [JOBX])
    if request.method == "GET" and "/rest/v1/hiring_applications" in url and "id=eq." not in url and "interview_at=gte" not in url and "stage=eq.new" not in url:
        return ok(APPS)
    return N.handler(route, request)

SAMPLE_AI = """# TITLE
Operations Coordinator

# POSTING
## About the role
You'll keep our weekly operations running: scheduling, vendors and reporting.

{{part1}}

## What you'll do
- Run the weekly schedule
- Follow up with vendors

{{part2}}

## What we're looking for
- Calm under shifting priorities
- A clear writer

{{part3}}

{{part4}}

## How to apply
We don't take résumés. The link to the application is hidden in this posting in pieces. Put them together in order and open the link.

# ACTIVITY STEPS
## Step 1
Question: It's Monday at 8am. Put these in the order you'd deal with them.
Guidance: There's no single right answer. We want your reasoning.
Options:
- Our CEO's flight to Chicago tomorrow was cancelled
- The Friday report is missing two vendors' numbers
- A vendor asks to move this afternoon's delivery
- There are 40 unread emails
## Step 2
Question: Three vendors all slip their deadlines in the same week. Write the message you'd send our team on Monday morning.
Guidance: Keep it short and specific.
## Step 3
Question: Tell us about a time you kept several moving parts on track for someone busy. What was your system?
Guidance: Be specific about what you did.

# INTERVIEW QUESTIONS
- [general] Walk me through your background.
- [custom] How would you build our Friday report?
- [custom] Which vendor conversation would you have first, and why?

# RUBRIC
- Clarity
- Initiative
- Role fit
"""

boxes = {}
def card_box(pg, text, nth=0, up='[class*="rounded-2xl"]', exact=True):
    return pg.evaluate("""([text, nth, up, exact]) => {
      const all = [...document.querySelectorAll('body *')].filter(e => {
        const t = (e.childElementCount === 0 ? e.textContent : [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')).trim();
        return exact ? t === text : t.includes(text);
      });
      const el = all[nth]; if (!el) return null;
      const c = up ? (el.closest(up) || el) : el;
      const r = c.getBoundingClientRect();
      return {x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height};
    }""", [text, nth, up, exact])

def shot(pg, name, clip=None, marks=(), full=True):
    pg.wait_for_timeout(250)
    path = f"{OUT}/{name}.png"
    if clip:
        pg.screenshot(path=path, full_page=True, clip=clip)
    else:
        pg.screenshot(path=path, full_page=full)
    cx, cy = (clip["x"], clip["y"]) if clip else (0, 0)
    cw, ch = (clip["width"], clip["height"]) if clip else pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]") if full else (pg.viewport_size["width"], pg.viewport_size["height"])
    res = []
    for m in marks:
        b = card_box(pg, *m) if isinstance(m, tuple) else card_box(pg, m)
        if b: res.append({"x": round((b["x"] - cx) / cw * 100, 2), "y": round((b["y"] - cy) / ch * 100, 2), "w": round(b["w"] / cw * 100, 2), "h": round(b["h"] / ch * 100, 2)})
        else: res.append(None)
    boxes[name] = res

def content_clip(pg, top=0, height=None, x=48, w=1184):
    total = pg.evaluate("document.documentElement.scrollHeight")
    return {"x": x, "y": top, "width": w, "height": min(height or total, total - top)}

def main(b):
    errors = []
    def mk(w, h, admin=False, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        ctx.add_init_script(NO_TOUR)
        ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), handler)
        if admin:
            ctx.add_init_script(f"try{{localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(SESSION))}); localStorage.setItem('a1234_admin','1');}}catch(e){{}}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        return ctx, pg

    # ── Admin, desktop ──
    ctx, pg = mk(1280, 900, admin=True)
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1500)
    shot(pg, "admin-overview", content_clip(pg, 0, 960),
         marks=[("7 days", 0, '[class*="rounded-xl"]'), ("New applicants",), ("Applicants per day",), ("From link to application",), ("Waiting for review", 1)])
    top = card_box(pg, "Jobs", 0, None)["y"] if card_box(pg, "Jobs", 0, None) else 900
    jt = pg.evaluate("[...document.querySelectorAll('h2')].find(h => h.textContent.trim()==='Jobs').getBoundingClientRect().top + scrollY")
    shot(pg, "admin-jobs", content_clip(pg, int(jt) - 24, 420), marks=[("+ New job", 0, None), ("Operations Coordinator", 0)])

    # Wizard
    pg.goto(BASE + "/admin/new"); pg.evaluate("localStorage.removeItem('a1234_wizard')"); pg.reload(); pg.wait_for_timeout(700)
    pg.locator("textarea").first.fill("- Ops coordinator for a 40-person team\n- Owns weekly schedule, vendor follow-ups, Friday report\n- Calm, clear writer, likes spreadsheets\n- Full time, hybrid (2 days in office)")
    shot(pg, "wiz-1-notes", content_clip(pg, 60, 900, 48, 860))
    pg.get_by_role("button", name=re.compile("Next: the link")).click(); pg.wait_for_timeout(900)
    shot(pg, "wiz-2-link", content_clip(pg, 60, 960, 48, 860), marks=[("The hidden link",), ("Number of pieces",)])
    pg.get_by_role("button", name=re.compile("Next: the activity")).click(); pg.wait_for_timeout(900)
    shot(pg, "wiz-3a-activity", content_clip(pg, 60, 1000, 48, 860))
    pg.get_by_role("button", name=re.compile("Next: AI prompt")).click(); pg.wait_for_timeout(700)
    shot(pg, "wiz-3-prompt", content_clip(pg, 60, 900, 48, 860))
    pg.get_by_role("button", name=re.compile("I have the reply")).click(); pg.wait_for_timeout(500)
    pg.locator("textarea").first.fill(SAMPLE_AI); pg.wait_for_timeout(500)
    shot(pg, "wiz-4-reply", content_clip(pg, 60, 1000, 48, 860))
    pg.get_by_role("button", name=re.compile("Next: review")).click(); pg.wait_for_timeout(500)
    shot(pg, "wiz-5-launch", content_clip(pg, 60, 1000, 48, 860))

    # Job editor tabs
    for tab, h in [("overview", 1000), ("posting", 900), ("puzzle", 1150), ("activity", 950), ("questions", 800), ("interview", 1000), ("candidates", 700)]:
        pg.goto(BASE + f"/admin/jobs/j1?tab={tab}"); pg.wait_for_timeout(1100)
        marks = []
        if tab == "puzzle": marks = [("Secret link",), ("Pieces",), ("Links per job board",)]
        shot(pg, f"job-{tab}", content_clip(pg, 56, h), marks=marks)

    pg.goto(BASE + "/admin/candidates"); pg.wait_for_timeout(1100)
    shot(pg, "admin-candidates", content_clip(pg, 56, 760))
    pg.goto(BASE + "/admin/candidates/a1"); pg.wait_for_timeout(1500)
    pg.evaluate('''() => document.querySelectorAll('iframe').forEach(f => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;inset:0;background:#1d1c22;display:grid;place-items:center;color:#cfcbc2;font:500 14px Inter,system-ui';
      d.innerHTML = '<div style="text-align:center"><div style="width:56px;height:56px;border-radius:50%;background:#ff5a1f;margin:0 auto 10px;display:grid;place-items:center"><div style="width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px"></div></div>Loom video plays here</div>';
      f.parentElement.style.position = 'relative'; f.replaceWith(d);
    })''')
    shot(pg, "candidate-page", content_clip(pg, 56, 1180),
         marks=[("Invite to interview", 0, None), ("✓ Loom", 0, None, False), ("QUESTION 1",), ("Your review",), ("Behavior",)])
    pg.evaluate("window.scrollTo(0,0)")
    pg.get_by_role("button", name="Export").click(); pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}/export.png")
    pg.goto(BASE + "/admin/inbox"); pg.wait_for_timeout(900)
    pg.get_by_text("I pasted my Loom link").click(); pg.wait_for_timeout(300)
    shot(pg, "admin-inbox", content_clip(pg, 56, 680, 48, 960))
    pg.goto(BASE + "/admin/activity"); pg.wait_for_timeout(1000)
    shot(pg, "admin-activity", content_clip(pg, 56, 760))
    pg.goto(BASE + "/admin/settings"); pg.wait_for_timeout(800)
    shot(pg, "admin-settings", content_clip(pg, 56, 760, 48, 860))
    pg.goto(BASE + "/admin/changelog"); pg.wait_for_timeout(800)
    shot(pg, "admin-changelog", content_clip(pg, 56, 820, 48, 960))
    ctx.close()

    # ── Candidate, mobile ──
    ctx, pg = mk(390, 844, mobile=True)
    pg.goto(BASE + "/p/abc123"); pg.wait_for_timeout(700); shot(pg, "cand-0-posting", full=False)
    pg.goto(BASE + "/harbr"); pg.wait_for_timeout(700); shot(pg, "cand-1-wrong", full=False)
    pg.goto(BASE + "/harbor-472"); pg.wait_for_timeout(800); shot(pg, "cand-2-welcome", full=False)
    pg.get_by_role("button", name="Begin").click(); pg.wait_for_timeout(500)
    pg.evaluate("window.scrollTo(0, 260)"); shot(pg, "cand-3-setup", full=False)
    pg.get_by_role("checkbox").check(); pg.get_by_role("button", name="Continue to questions").click(); pg.wait_for_timeout(500)
    inputs = pg.locator("input[inputmode=url]")
    inputs.nth(0).fill("https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184"); inputs.nth(0).blur(); pg.wait_for_timeout(700)
    pg.locator("textarea").nth(0).fill("So at my last job, nobody had documented the vendor process...")
    pg.evaluate("window.scrollTo(0, 230)"); shot(pg, "cand-4-answers", full=False)
    pg.locator("textarea").nth(1).fill("First I'd triage which deadline matters most and call that vendor.")
    inputs.nth(1).fill("https://www.loom.com/share/1281766fa2d04bb788eaf19e65135184"); inputs.nth(1).blur(); pg.wait_for_timeout(700)
    pg.get_by_role("button", name="Continue", exact=True).click(); pg.wait_for_timeout(500)
    pg.get_by_label("Full name").fill("Jane Rivera"); pg.get_by_label("Email", exact=True).fill("jane@example.com")
    pg.get_by_role("button", name=re.compile("Add a résumé")).click()
    pg.locator("input[type=file]").first.set_input_files("/tmp/resume.pdf"); pg.wait_for_timeout(700)
    pg.get_by_role("checkbox").check()
    pg.evaluate("window.scrollTo(0, 560)"); shot(pg, "cand-5-submit", full=False)
    pg.get_by_role("button", name=re.compile("No, I didn")).click(); pg.get_by_role("button", name="Submit application").click(); pg.wait_for_timeout(1000)
    shot(pg, "cand-6-done", full=False)
    pg.get_by_role("button", name="Need help?").click(); pg.wait_for_timeout(400)
    shot(pg, "cand-7-help", full=False)
    ctx.close()
    json.dump(boxes, open(f"{OUT}/boxes.json", "w"), indent=1)
    print("errors:", [e for e in errors if "localStorage" not in e][:8])

def run():
    open("/tmp/resume.pdf", "wb").write(b"%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        main(b); b.close()

if __name__ == "__main__":
    run()
