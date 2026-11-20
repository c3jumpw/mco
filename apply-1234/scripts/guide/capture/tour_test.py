"""Checks the getting-started tour and What's new against the current build (served at BASE)."""
import json, re, sys
from playwright.sync_api import sync_playwright
from fixtures import *
import guide_shots as G
import access_shots as A

errors = []
def check(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: errors.append(label)

def main(b):
    def mk(w, h, created, who="admin", mobile=False, seen=None):
        A.MODE["who"] = who
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        ctx.route(re.compile(r".*(supabase\.co|/api/loom).*"), A.handler)
        sess = json.loads(json.dumps(SESSION))
        sess["user"]["created_at"] = created
        if who == "editor": sess["user"] = dict(sess["user"], id="u8", email="sam@agency.com")
        init = f"try{{localStorage.setItem('apply1234-admin', {json.dumps(json.dumps(sess))});"
        if seen is not None: init += f"localStorage.setItem('a1234_tour', {json.dumps(json.dumps(seen))});"
        ctx.add_init_script(init + "}catch(e){}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        return ctx, pg
    dialog = lambda pg: pg.get_by_role("dialog")
    counter = lambda pg: re.search(r"(\d+) / (\d+)", dialog(pg).inner_text())

    # A new admin gets the full tour on their first visit
    ctx, pg = mk(1280, 860, "2026-11-20T10:00:00Z")
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1800)
    check(dialog(pg).count() == 1 and "Welcome to apply1234" in dialog(pg).inner_text(), "new admin: tour opens on first visit")
    total = int(counter(pg).group(2))
    check(total >= 20, f"tour has a slide for every part ({total} slides)")
    pg.screenshot(path=f"{SHOTS}/tour-desktop.png")
    # Every slide's picture loads
    broken = []
    for n in range(total):
        pg.wait_for_timeout(250)
        ok = pg.evaluate("() => { const i = document.querySelector('[role=dialog] img'); return !i || (i.complete && i.naturalWidth > 0); }")
        if not ok: broken.append(n + 1)
        if n < total - 1: pg.keyboard.press("ArrowRight")
    check(not broken, f"every slide picture loads (broken: {broken})")
    check(counter(pg).group(1) == str(total) and "Start using apply1234" in dialog(pg).inner_text(), "last slide has the finish button")
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(150)
    check(counter(pg).group(1) == str(total - 1), "left arrow goes back")
    pg.get_by_label("Jump to a part of the tour").select_option("Review candidates"); pg.wait_for_timeout(200)
    check("Candidates" in dialog(pg).locator("h2").inner_text(), "jump to a section")
    pg.screenshot(path=f"{SHOTS}/test-tour-review.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check(dialog(pg).count() == 0, "Esc closes the tour")
    seen = pg.evaluate("() => JSON.parse(localStorage.getItem('a1234_tour'))")
    check(seen.get(ADMIN_EMAIL, 0) >= 1, "closing marks it seen")
    pg.reload(); pg.wait_for_timeout(1800)
    check(dialog(pg).count() == 0, "tour doesn't come back after closing")
    # Help menu opens it again; a slide's link goes to its page
    pg.get_by_role("button", name=re.compile("Help")).click(); pg.wait_for_timeout(200)
    pg.screenshot(path=f"{SHOTS}/test-help-menu.png", clip={"x": 760, "y": 0, "width": 520, "height": 330})
    pg.get_by_role("menuitem", name=re.compile("Getting-started tour")).click(); pg.wait_for_timeout(400)
    check(dialog(pg).count() == 1, "Help menu opens the tour")
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
    pg.goto(BASE + "/admin/inbox"); pg.wait_for_timeout(800)
    pg.get_by_role("button", name=re.compile("Help")).click(); pg.get_by_role("menuitem", name=re.compile("Getting-started tour")).click(); pg.wait_for_timeout(300)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(150)
    dialog(pg).get_by_role("button", name=re.compile("Open the dashboard")).click(); pg.wait_for_timeout(600)
    check(pg.url.rstrip("/").endswith("/admin") and dialog(pg).count() == 0, "a slide's link closes the tour and opens the page")
    ctx.close()

    # Someone who used apply1234 before the tour gets What's new instead
    ctx, pg = mk(1280, 860, "2026-11-06T10:00:00Z")
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1800)
    text = dialog(pg).inner_text() if dialog(pg).count() else ""
    latest = re.search(r"title: '([^']+)'", (HERE.parent.parent.parent / "src/admin/tour/whatsnew.ts").read_text()).group(1)
    check("WHAT’S NEW" in text and latest in text, f"existing admin: What's new opens instead, newest first ({latest})")
    pg.screenshot(path=f"{SHOTS}/test-whats-new.png")
    n = int(counter(pg).group(2))
    for _ in range(n - 1): pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(200)
    dialog(pg).get_by_role("button", name=re.compile("Take the full getting-started tour")).click(); pg.wait_for_timeout(300)
    check("Welcome to apply1234" in dialog(pg).inner_text(), "What's new links to the full tour")
    ctx.close()

    # Seen the latest already: nothing opens
    ctx, pg = mk(1280, 860, "2026-11-06T10:00:00Z", seen={ADMIN_EMAIL: 999})
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1800)
    check(dialog(pg).count() == 0, "up to date: nothing opens")
    ctx.close()

    # Full access to one job: shorter tour, without admin-only parts
    ctx, pg = mk(1280, 860, "2026-11-20T10:00:00Z", who="editor")
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1800)
    check(dialog(pg).count() == 1 and int(counter(pg).group(2)) < total, f"full-access tour is shorter ({counter(pg).group(2) if dialog(pg).count() else 0} slides)")
    titles = []
    for _ in range(int(counter(pg).group(2))):
        titles.append(dialog(pg).locator("h2").inner_text()); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(80)
    check(not any(t in titles for t in ("Inbox", "Settings", "1. Paste your notes", "Share a job")), "full-access tour leaves out admin-only parts")
    ctx.close()

    # Phone: full screen, swipe to move
    ctx, pg = mk(390, 844, "2026-11-20T10:00:00Z", mobile=True)
    pg.goto(BASE + "/admin"); pg.wait_for_timeout(1800)
    pg.screenshot(path=f"{SHOTS}/test-tour-phone.png")
    box = dialog(pg).bounding_box()
    check(box and box["width"] >= 389 and box["height"] >= 840, "phone: tour fills the screen")
    pg.evaluate("""() => { const d = document.querySelector('[role=dialog]');
      const t = (type, x) => new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [new Touch({identifier: 1, target: d, clientX: x, clientY: 400})],
        changedTouches: [new Touch({identifier: 1, target: d, clientX: x, clientY: 400})] });
      d.dispatchEvent(t('touchstart', 320)); d.dispatchEvent(t('touchend', 120)); }""")
    pg.wait_for_timeout(250)
    check(counter(pg).group(1) == "2", "phone: swipe moves to the next slide")
    pg.screenshot(path=f"{SHOTS}/test-tour-phone-2.png")
    ctx.close()

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        main(b); b.close()
    real = [e for e in errors if not e.startswith("pageerror: Failed to read the 'localStorage'")]
    print("\n".join(real) if real else "ALL PASSED")
    return not real

if __name__ == "__main__":
    sys.exit(0 if run() else 1)
