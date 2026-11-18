import json, re, sys, copy
from playwright.sync_api import sync_playwright
from fixtures import *
import run as base

calls = []
errors = []

STEPS = [
  {"id":"s1","type":"musthave","text":"Do you have the right to work in Canada?","expected":"yes"},
  {"id":"s2","type":"quiz","text":"A big client emails at 4:55pm: the campaign launching tomorrow has the wrong price. What do you do first?","options":["Reply tomorrow morning","Pause the launch and confirm the right price with the client tonight","Fix the price yourself and relaunch","Forward it to your manager and log off"],"correct":1,"time_limit":60,"reason":True,"paste":"block"},
  {"id":"s3","type":"rank","text":"It’s Monday at 8am. Put these in the order you’d deal with them.","options":["The CEO’s flight tomorrow was cancelled","An invoice due today is missing a signature","A client asks to move this afternoon’s meeting","40 unread emails"],"reason":True},
  {"id":"s4","type":"written","text":"Write the follow-up email you’d send after a first call where the prospect said “send me some info”.","words":150,"paste":"flag"},
  {"id":"s5","type":"work","text":"Share up to 3 pieces of work you’re proud of. For each, tell us your role and the result.","items":3},
  {"id":"s6","type":"brief","text":"Our spring campaign underperformed. Using the numbers below, send us a one-page plan for the next 30 days.","material":"| Channel | Spend | Leads |\n|---|---|---|\n| Instagram | $2,000 | 41 |\n| Google | $3,000 | 22 |","deliverable":"either","walkthrough":"optional","minutes":20},
  {"id":"s7","type":"voice","text":"In 30 seconds, tell us why you’d be great at this job.","time_limit":45},
  {"id":"s8","type":"critique","text":"Look at our homepage. What works, what would you change first, and why?","material_url":"https://example.com","respond":"written","paste":"flag"},
  {"id":"s9","type":"choice","text":"Walk us through how you’d plan your first week.","optional":True},
]
JOB2 = dict(copy.deepcopy(JOB), id="j2", title="Digital Marketing Lead", slug="mkt-2201",
            activity=dict(JOB["activity"], require_transcript=False, hidden_code="", ai_policy="welcome", pledge=True, extra=""), questions=STEPS)

APP3 = {
  "id":"a3","job_id":"j2","name":"Priya Shah","email":"priya@example.com","visitor_id":"v9","stage":"new","tags":[],"consent":True,
  "answers":[
    {"question_id":"s1","question":STEPS[0]["text"],"type":"musthave","url":"","yesno":"yes","ok":True,"skipped":False},
    {"question_id":"s2","question":STEPS[1]["text"],"type":"quiz","url":"","choice":1,"correct":True,"seconds":34,"reason":"A wrong price live is worse than a short delay.","sig":{"typed":48,"ms":21000},"skipped":False},
    {"question_id":"s3","question":STEPS[2]["text"],"type":"rank","url":"","order":[0,1,2,3],"reason":"Travel has the shortest window to fix.","sig":{"typed":40,"ms":15000},"skipped":False},
    {"question_id":"s4","question":STEPS[3]["text"],"type":"written","mode":"written","url":"","text":"Hi Dana,\n\nThanks for the time today. As promised, here's a one-pager on how we cut onboarding time for teams like yours...\n\nWould Thursday at 2pm work for 20 minutes?","sig":{"typed":120,"pasted":310,"pastes":1,"ms":95000,"blurs":2},"skipped":False},
    {"question_id":"s5","question":STEPS[4]["text"],"type":"work","url":"","links":[{"url":"https://www.behance.net/priya/spring","note":"Led the campaign; 3.1x ROAS."}],"files":[{"path":"j2/v9/x-s5-deck.pdf","name":"Q3 results deck.pdf","size":820000,"type":"application/pdf","note":"Wrote and designed it."}],"text":"","skipped":False},
    {"question_id":"s6","question":STEPS[5]["text"],"type":"brief","url":"","deliverable":"https://docs.google.com/document/d/abc","files":[],"text":"Assumed the Google spend is mostly brand terms.","walk_url":"https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184","walk_loom_id":"0281766fa2d04bb788eaf19e65135184","walk_title":"Plan walkthrough","seconds":2280,"skipped":False},
    {"question_id":"s7","question":STEPS[6]["text"],"type":"voice","url":"","voice":{"path":"j2/v9/x-s7-voice.webm","name":"voice.webm","size":40000,"type":"audio/webm","seconds":31},"skipped":False},
    {"question_id":"s8","question":STEPS[7]["text"],"type":"critique","mode":"written","url":"","text":"The hero says what you do, but the button is below the fold on mobile.","sig":{"typed":72,"ms":60000},"skipped":False},
    {"question_id":"s9","question":STEPS[8]["text"],"type":"choice","url":"","skipped":True},
  ],
  "flags":{"musthave_ok":True,"quiz_right":1,"quiz_total":1,"pasted":True,"ai_used":True,"duplicate_email":False},
  "metrics":{"ai_use":{"used":True,"how":"ChatGPT to tighten the email in step 4."},"pledge":True,"active_seconds":3100},
  "interview_at":None,"interview_answers":{},"interview_summary":"","submitted_at":NOW,"updated_at":NOW,"attachments":[],"cover_letter":""}

def handler(route, request):
    url = request.url
    def ok(body, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
    if request.method == "POST" and any(k in url for k in ("/rpc/hiring_submit", "/storage/v1/object/hiring-uploads", "/rpc/hiring_track")):
        calls.append((url.split("/")[-1].split("?")[0] if "rpc" in url else "upload", request.post_data if "rpc" in url else len(request.post_data_buffer or b"")))
    if "/rpc/hiring_resolve" in url:
        body = json.loads(request.post_data or "{}")
        if body.get("p_path","").strip("/") == "mkt-2201":
            qs = [{k: v for k, v in q.items() if k not in ("correct", "expected")} for q in STEPS]
            return ok({"found": True, "closed": False, "job_id": "j2", "title": JOB2["title"], "activity": JOB2["activity"], "questions": qs})
    if "/storage/v1/object/sign/" in url: return ok({"signedURL": "/object/sign/hiring-uploads/x?token=t"})
    if "/storage/v1/object/hiring-uploads" in url: return ok({"Key": "hiring-uploads/x", "Id": "1"})
    if "/functions/v1/hiring-notify" in url:
        if request.method == "OPTIONS": return route.fulfill(status=200, headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*"}, body="ok")
        return route.fulfill(status=200, headers={"Access-Control-Allow-Origin":"*"}, content_type="application/json", body=json.dumps({"ok": True, "results": {"candidate": {"ok": True}}}))
    if "/rest/v1/hiring_jobs" in url and request.method == "GET" and ("id=eq.j2" in url):
        single = "vnd.pgrst.object" in request.headers.get("accept", "")
        return ok(JOB2 if single else [JOB2])
    if "/rest/v1/hiring_jobs" in url and request.method == "GET":
        return ok([JOB, JOB2])
    if "/rest/v1/hiring_applications" in url and request.method == "GET" and "id=eq.a3" in url:
        return ok(APP3 if "vnd.pgrst.object" in request.headers.get("accept", "") else [APP3])
    if "/rest/v1/hiring_applications" in url and request.method == "GET":
        return ok([APP, APP2, APP3])
    return base.handler(route, request)

def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: errors.append("FAIL " + label)

def main(b):
    def mk(w, h, admin=False, mobile=False):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
                            permissions=["microphone"])
        ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), handler)
        ctx.add_init_script(NO_TOUR)
        if admin:
            ctx.add_init_script(f"try {{ localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(SESSION))}); localStorage.setItem('a1234_admin','1'); }} catch (e) {{}}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
        return ctx, pg

    which = sys.argv[1:] or ["candidate", "admin"]
    if "candidate" in which:
        ctx, pg = mk(390, 844, mobile=True)
        pg.goto(BASE + "/mkt-2201"); pg.wait_for_timeout(700)
        pg.screenshot(path="s1_welcome.png", full_page=True)
        body = pg.inner_text("body")
        check("AI is welcome" in body, "welcome shows AI note")
        check("Loom (free), if you choose to record" in body, "welcome mentions optional Loom")
        check("About" in body and "minutes" in body, "welcome shows time estimate")
        pg.get_by_role("button", name="Begin").click(); pg.wait_for_timeout(500)
        check("Your activity." in pg.inner_text("body"), "skips Loom setup and lands on the steps")
        cards = pg.locator("main .rounded-2xl.bg-card")
        check(cards.count() == 9, f"9 step cards (got {cards.count()})")
        # must-have
        cards.nth(0).get_by_role("button", name="Yes").click()
        # quiz: start, pick, try to paste reason (blocked), lock in
        q = cards.nth(1)
        check("A quick scenario" in q.inner_text() and "wrong price" not in q.inner_text(), "quiz hides the question until Start")
        q.get_by_role("button", name="Start").click(); pg.wait_for_timeout(300)
        check("wrong price" in q.inner_text(), "quiz shows question after Start")
        check(q.locator("[role=timer]").count() == 1, "quiz shows a countdown")
        q.get_by_role("radio").nth(1).click()
        ta = q.locator("textarea")
        ta.evaluate("el => { const dt = new DataTransfer(); dt.setData('text/plain', 'pasted reasoning'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }")
        pg.wait_for_timeout(200)
        check("Pasting is off" in q.inner_text(), "paste is blocked on the quiz reason")
        ta.click(); pg.keyboard.type("Wrong price live is worse than a delay.")
        pg.screenshot(path="s2_quiz.png", full_page=False)
        q.get_by_role("button", name="Lock in answer").click(); pg.wait_for_timeout(200)
        check("Locked in" in q.inner_text(), "quiz locks after answering")
        # rank
        r = cards.nth(2)
        r.get_by_role("button", name=re.compile("Move “40 unread emails” up")).click()
        r.locator("textarea").click(); pg.keyboard.type("Travel has the shortest window to fix.")
        # written: type, then paste a chunk
        w = cards.nth(3)
        wt = w.locator("textarea")
        wt.click(); pg.keyboard.type("Hi Dana, thanks for the call. ")
        chunk = "Here is a one-page overview of how we help teams like yours cut onboarding time in half, with two short case studies."
        wt.evaluate("(el, t) => { const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }", chunk)
        pg.keyboard.insert_text(chunk)
        check("We note whether answers are typed or pasted" in w.inner_text(), "written step tells candidates pasting is noted")
        # work sample
        wk = cards.nth(4)
        wk.locator("input[inputmode=url]").fill("https://www.behance.net/priya/spring")
        wk.locator("textarea").fill("Led the campaign; 3.1x ROAS.")
        # brief
        br = cards.nth(5)
        check("Our spring campaign" not in br.inner_text(), "brief hidden until opened")
        br.get_by_role("button", name="Start").click(); pg.wait_for_timeout(200)
        check(br.locator("table").count() == 1, "brief shows its data table")
        br.locator("input[inputmode=url]").first.fill("https://docs.google.com/document/d/abc"); br.locator("input[inputmode=url]").first.blur()
        # voice: record 2s with the fake microphone, then save
        v = cards.nth(6)
        v.get_by_role("button", name="Start recording").click(); pg.wait_for_timeout(2300)
        v.get_by_role("button", name="■ Stop").click(); pg.wait_for_timeout(600)
        v.get_by_role("button", name="Use this recording").click(); pg.wait_for_timeout(800)
        check("Voice note saved" in v.inner_text(), "voice note recorded and saved")
        # critique
        c = cards.nth(7)
        check(c.get_by_role("link", name=re.compile("Open example.com")).count() == 1, "critique links to the page")
        c.locator("textarea").click(); pg.keyboard.type("The hero is clear but the button is below the fold on mobile.")
        pg.screenshot(path="s3_steps.png", full_page=True)
        check(pg.get_by_role("button", name="Continue").is_enabled(), "Continue enabled with optional step left empty")
        pg.get_by_role("button", name="Continue").click(); pg.wait_for_timeout(400)
        # submit
        pg.get_by_label("Full name").fill("Priya Shah"); pg.get_by_label("Email").fill("priya@example.com")
        submit = pg.get_by_role("button", name="Submit application")
        check(submit.is_disabled(), "submit waits for AI answer and pledge")
        pg.get_by_role("button", name="Yes, I did").click()
        pg.locator("textarea[placeholder^='Which tool']").fill("ChatGPT to tighten the email in step 4.")
        boxes = pg.get_by_role("checkbox")
        for i in range(boxes.count()): boxes.nth(i).check()
        pg.screenshot(path="s4_submit.png", full_page=True)
        submit.click(); pg.wait_for_timeout(900)
        pg.screenshot(path="s5_done.png")
        subs = [json.loads(d) for k, d in calls if k == "hiring_submit"]
        check(len(subs) == 1, "submitted once")
        if subs:
            p = subs[0]
            ans = {a["question_id"]: a for a in p["p_answers"]}
            check(ans["s1"]["yesno"] == "yes", "must-have sent")
            check(ans["s2"]["choice"] == 1 and ans["s2"]["answered_at"] and ans["s2"]["sig"].get("blocked") == 1, "quiz choice, time and blocked paste sent")
            check(ans["s3"]["order"] == [0, 1, 3, 2], f"rank order sent ({ans['s3']['order']})")
            sig = ans["s4"]["sig"]
            check(sig.get("pastes") == 1 and sig.get("pasted") == len(chunk) and sig.get("typed", 0) >= 25, f"written typing signals ({sig})")
            check(ans["s5"]["links"][0]["note"].startswith("Led"), "work sample link and note")
            check(ans["s6"]["deliverable"].startswith("https://docs") and ans["s6"]["opened_at"], "brief deliverable and open time")
            check(ans["s7"]["voice"] and ans["s7"]["voice"]["path"].startswith("j2/"), f"voice path sent ({ans['s7'].get('voice')})")
            check(ans["s8"]["mode"] == "written" and ans["s8"]["text"], "critique written answer")
            check(p["p_meta"]["ai_use"] == {"used": True, "how": "ChatGPT to tighten the email in step 4."} and p["p_meta"]["pledge"] is True, "AI disclosure and pledge in metadata")
            check(all("correct" not in json.dumps(a) or a["question_id"] == "s2" for a in p["p_answers"]), "no answer keys leak into payload")
        ctx.close()

        # Timed quiz runs out after a reload and locks
        ctx, pg = mk(1280, 900)
        STEPS[1]["time_limit"] = 3
        pg.goto(BASE + "/mkt-2201"); pg.wait_for_timeout(500)
        pg.get_by_role("button", name="Begin").click(); pg.wait_for_timeout(300)
        q = pg.locator("main .rounded-2xl.bg-card").nth(1)
        q.get_by_role("button", name="Start").click(); pg.wait_for_timeout(1000)
        pg.reload(); pg.wait_for_timeout(3000)
        q = pg.locator("main .rounded-2xl.bg-card").nth(1)
        check("Time ran out" in q.inner_text(), "quiz times out across a reload")
        STEPS[1]["time_limit"] = 60
        ctx.close()

    if "admin" in which:
        ctx, pg = mk(1280, 900, admin=True)
        pg.goto(BASE + "/admin/jobs/j2?tab=questions"); pg.wait_for_timeout(1200)
        pg.screenshot(path="s6_builder.png", full_page=True)
        check("9 steps" in pg.inner_text("body"), "builder shows the step count")
        pg.get_by_role("button", name="+ Add a step").first.click(); pg.wait_for_timeout(300)
        pg.screenshot(path="s7_library.png")
        check(pg.get_by_text("Quick scenario").count() >= 1, "library lists step types")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        pg.get_by_role("button", name="Presets by role").click(); pg.wait_for_timeout(300)
        check("Suggested" in pg.inner_text("body"), "presets suggest a family")
        pg.screenshot(path="s8_presets.png")
        pg.keyboard.press("Escape")
        pg.goto(BASE + "/admin/candidates/a3"); pg.wait_for_timeout(1500)
        pg.screenshot(path="s9_candidate.png", full_page=True)
        t = pg.inner_text("body")
        check("Best answer" in t and "Their pick" in t, "quiz answer shows pick and best answer")
        check("Mostly pasted" in t, "pasted written answer is called out")
        check("Used AI" in t and "ChatGPT to tighten" in t, "AI use shown")
        check("Scenarios 1/1" in t and "Must-haves" in t, "flags show scenario score and must-haves")
        check("Skipped. This step was optional." in t, "skipped optional step")
        ctx.close()
        # wizard activity step (mobile)
        ctx, pg = mk(390, 844, admin=True, mobile=True)
        state = {"v": 2, "step": 2, "title": "Digital Marketing Lead", "notes": "Own our paid social and content.", "questionCount": 5, "answer": "60-180",
                 "useCodeWord": True, "codeWord": "lantern", "requireTranscript": True, "domain": "apply1234.com", "slug": "ab12-cd34", "parts": 4,
                 "hintFormat": "Part {n} of {total}: {text}", "aiText": "", "skippedAi": False, "steps": None}
        ctx.add_init_script(f"try {{ localStorage.setItem('a1234_wizard', {json.dumps(json.dumps(state))}); }} catch (e) {{}}")
        pg.goto(BASE + "/admin/new"); pg.wait_for_timeout(1200)
        t = pg.inner_text("body")
        pg.screenshot(path="s10_wizard.png", full_page=True)
        check("What candidates will do" in t, "wizard Activity step")
        ctx.close()

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME,
                              args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        main(b)
        b.close()
    print("\n".join(errors) if errors else "ALL PASSED")

if __name__ == '__main__':
    run()
