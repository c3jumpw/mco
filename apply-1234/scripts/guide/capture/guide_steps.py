"""Guide screenshots for activity step types (run after guide_shots.py)."""
import json, re
from playwright.sync_api import sync_playwright
import steps_test as T

from fixtures import SHOTS as OUT, BASE, CHROME, NO_TOUR

def mk(b, w, h, admin=False, mobile=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, permissions=["microphone"])
    ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), T.handler)
    ctx.add_init_script(NO_TOUR)
    if admin:
        ctx.add_init_script(f"try {{ localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(T.SESSION))}); localStorage.setItem('a1234_admin','1'); }} catch (e) {{}}")
    return ctx, ctx.new_page()

def card(pg, text, up="[class*='rounded-2xl']"):
    return pg.evaluate("""([text, up]) => {
      const el = [...document.querySelectorAll('body *')].find(e => e.childElementCount === 0 && e.textContent.trim().startsWith(text));
      if (!el) return null; const c = el.closest(up) || el; const r = c.getBoundingClientRect();
      return {x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height};
    }""", [text, up])

def main(b):
    boxes = json.load(open(f"{OUT}/boxes.json"))
    # Candidate phone screens
    ctx, pg = mk(b, 390, 844, mobile=True)
    pg.goto(BASE + "/mkt-2201"); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{OUT}/cand-8-welcome.png")
    pg.get_by_role("button", name="Begin").click(); pg.wait_for_timeout(500)
    cards = pg.locator("main .rounded-2xl.bg-card")
    cards.nth(0).get_by_role("button", name="Yes").click()
    cards.nth(1).get_by_role("button", name="Start").click(); pg.wait_for_timeout(300)
    cards.nth(1).get_by_role("radio").nth(1).click()
    cards.nth(1).locator("textarea").click(); pg.keyboard.type("A wrong price live costs more than a short delay.")
    pg.wait_for_timeout(1200)
    box = card(pg, "STEP 2 OF 9")
    pg.evaluate(f"window.scrollTo(0, {int(box['y']) - 70})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-9-quiz.png")
    cards.nth(1).get_by_role("button", name="Lock in answer").click()
    r = cards.nth(2)
    r.get_by_role("button", name=re.compile("Move “40 unread emails” up")).click()
    r.locator("textarea").click(); pg.keyboard.type("Travel has the shortest window to fix.")
    w = cards.nth(3).locator("textarea")
    w.click(); pg.keyboard.type("Hi Dana, thanks for your time today. As promised, here's a one-pager on how we help teams like yours.")
    box = card(pg, "STEP 3 OF 9")
    pg.evaluate(f"window.scrollTo(0, {int(box['y']) - 70})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-10-rank.png")
    # finish the rest quickly so Submit is reachable
    cards.nth(4).locator("input[inputmode=url]").fill("https://www.behance.net/priya/spring")
    cards.nth(5).get_by_role("button", name="Start").click(); pg.wait_for_timeout(200)
    cards.nth(5).locator("input[inputmode=url]").first.fill("https://docs.google.com/document/d/abc")
    box = card(pg, "STEP 6 OF 9")
    pg.evaluate(f"window.scrollTo(0, {int(box['y']) - 70})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-11-brief.png")
    v = cards.nth(6)
    v.get_by_role("button", name="Start recording").click(); pg.wait_for_timeout(1500)
    v.get_by_role("button", name="■ Stop").click(); pg.wait_for_timeout(500)
    box = card(pg, "STEP 7 OF 9")
    pg.evaluate(f"window.scrollTo(0, {int(box['y']) - 70})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-12-voice.png")
    v.get_by_role("button", name="Use this recording").click(); pg.wait_for_timeout(700)
    cards.nth(7).locator("textarea").click(); pg.keyboard.type("Clear hero, but the button sits below the fold on phones.")
    pg.get_by_role("button", name="Continue").click(); pg.wait_for_timeout(400)
    pg.get_by_label("Full name").fill("Priya Shah"); pg.get_by_label("Email").fill("priya@example.com")
    pg.get_by_role("button", name="Yes, I did").click()
    pg.locator("textarea[placeholder^='Which tool']").fill("ChatGPT to tighten the email in step 4.")
    boxes_ = pg.get_by_role("checkbox")
    for i in range(boxes_.count()): boxes_.nth(i).check()
    box = card(pg, "Did you use AI for any of this?")
    pg.evaluate(f"window.scrollTo(0, {int(box['y']) - 250})"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/cand-13-ai.png")
    ctx.close()

    # Admin: Steps tab with an open quiz step, the step library and presets
    ctx, pg = mk(b, 1280, 900, admin=True)
    pg.goto(BASE + "/admin/jobs/j2?tab=questions"); pg.wait_for_timeout(1200)
    pg.get_by_text("A big client emails at 4:55pm", exact=False).first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/job-steps.png", clip={"x": 48, "y": 250, "width": 1184, "height": 980}, full_page=True)
    pg.get_by_role("button", name="+ Add a step").first.click(); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/step-library.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Presets by role").click(); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/step-presets.png")
    pg.keyboard.press("Escape")
    # Candidate answers as reviewers see them
    pg.goto(BASE + "/admin/candidates/a3"); pg.wait_for_timeout(1500)
    top = card(pg, "STEP 2 · QUICK SCENARIO", "[class*='rounded-']")
    end = card(pg, "STEP 5 · SHOW YOUR WORK", "[class*='rounded-']")
    main_w = pg.evaluate("document.querySelector('main .grid > div').getBoundingClientRect().width") if pg.locator('main .grid > div').count() else 784
    clip = {"x": int(top["x"]) - 12, "y": int(top["y"]) - 12, "width": int(top["w"]) + 24, "height": int(end["y"] - top["y"]) - 4}
    pg.screenshot(path=f"{OUT}/candidate-steps.png", clip=clip, full_page=True)
    # Numbered callouts on the three answer cards in that picture.
    marks = []
    for label in ("STEP 2 · QUICK SCENARIO", "STEP 3 · RANK IT", "STEP 4 · WRITTEN ANSWER"):
        r = card(pg, label, "[class*='rounded-']")
        marks.append({"x": round((r["x"] - clip["x"]) / clip["width"] * 100, 2), "y": round((r["y"] - clip["y"]) / clip["height"] * 100, 2),
                      "w": round(r["w"] / clip["width"] * 100, 2), "h": round(min(r["h"], clip["y"] + clip["height"] - r["y"]) / clip["height"] * 100, 2)})
    boxes["candidate-steps"] = marks
    ctx.close()
    json.dump(boxes, open(f"{OUT}/boxes.json", "w"), indent=1)

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        main(b); b.close()
    print("step shots, errors:", [e for e in T.errors if "localStorage" not in e][:8])

if __name__ == "__main__":
    run()
