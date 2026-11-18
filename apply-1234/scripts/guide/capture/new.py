"""More mock data on top of run.py: dashboard, inbox messages, résumé uploads and notification calls."""
import json, datetime
from fixtures import *
import run as base

calls = []
MSG = {"id":"m1","job_id":"j1","application_id":"a1","visitor_id":"v123","kind":"bug","name":"Jane Rivera","email":"jane@example.com",
       "body":"I pasted my Loom link but the Continue button stayed grey.","context":{"step":"Answers","browser":"Safari on iOS","screen":"390x844","tz":"America/New_York"},
       "status":"new","admin_note":"","notified_at":None,"created_at":NOW,"updated_at":NOW}
MSG2 = dict(MSG, id="m2", kind="question", name="Marcus Lee", email="marcus@example.com", body="Is this role remote or in person?", status="open", application_id=None, context={})
today = datetime.date(2026,11,7)
SERIES = [{"day": str(today - datetime.timedelta(days=13-i)), "arrivals": a, "starts": s, "applicants": p}
          for i,(a,s,p) in enumerate([(2,1,0),(4,2,1),(3,3,2),(0,0,0),(5,4,2),(6,3,1),(2,2,2),(7,5,3),(4,3,1),(3,1,0),(8,6,4),(5,4,3),(6,4,2),(3,2,1)])]
DASH = {"tz":"America/New_York","days":7,"start":"2026-11-01T04:00:00Z","applicants":14,"applicants_prev":9,"posting_views":40,"arrivals":36,
        "arrivals_prev":30,"starts":25,"wrong_tries":37,"wrong_visitors":19,"to_review":3,"shortlisted":1,"interviews_next7":2,
        "messages_new":1,"messages_period":2,"live_jobs":1,"series":SERIES}
APPX = dict(APP, cover_letter="I've run weekly ops for a 40-person team and love making messy schedules calm.\n\nThanks for reading.",
            attachments=[{"kind":"resume","path":"j1/v123/abc-resume-jane-rivera.pdf","name":"Jane Rivera resume.pdf","size":184320,"type":"application/pdf"}])

def handler(route, request):
    url = request.url
    def ok(body, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
    for key in ("/rpc/hiring_contact", "/rpc/hiring_attach", "/functions/v1/hiring-notify", "/storage/v1/object/hiring-uploads", "/rpc/hiring_submit"):
        if key in url and request.method == "POST":
            calls.append((key, url, request.post_data if "storage" not in url else f"<file {len(request.post_data_buffer or b'')} bytes>"))
    if "/rpc/hiring_contact" in url: return ok({"ok": True, "id": "m9"})
    if "/rpc/hiring_attach" in url: return ok({"ok": True, "files": 1})
    if "/functions/v1/hiring-notify" in url:
        if request.method == "OPTIONS": return route.fulfill(status=200, headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*"}, body="ok")
        return route.fulfill(status=200, headers={"Access-Control-Allow-Origin":"*"}, content_type="application/json", body=json.dumps({"ok": True, "results": {"candidate": {"ok": True}}}))
    if "/storage/v1/object/sign/" in url: return ok({"signedURL": "/object/sign/hiring-uploads/x?token=t"})
    if "/storage/v1/object/hiring-uploads" in url: return ok({"Key": "hiring-uploads/x", "Id": "1"})
    if "/rpc/hiring_dashboard" in url: return ok(DASH)
    if "/rest/v1/hiring_messages" in url:
        if request.method in ("PATCH",): return route.fulfill(status=204, body="")
        if request.method == "HEAD" or "count" in (request.headers.get("prefer","")):
            return route.fulfill(status=200, headers={"content-range": "0-0/1", "Access-Control-Expose-Headers":"content-range"}, content_type="application/json", body="[]")
        return ok([MSG, MSG2])
    if "/rest/v1/hiring_applications" in url and request.method == "GET" and "id=eq.a1" in url:
        return ok(APPX if "vnd.pgrst.object" in request.headers.get("accept","") else [APPX])
    if "/rest/v1/hiring_applications" in url and request.method == "GET" and "interview_at=gte" in url:
        return ok([dict(APP2, interview_at="2026-11-10T15:00:00Z")])
    if "/rest/v1/hiring_jobs" in url and "select=id%2Ctitle%2Cslug%2Csources" in url.replace(",", "%2C").replace("%20",""):
        return ok([{"id":"j1","title":JOB["title"],"slug":"harbor-472","sources":[{"id":"s1","label":"LinkedIn","code":"lnk","active":True}]}])
    if "/rest/v1/hiring_admins" in url and request.method == "GET":
        return ok([{"email":ADMIN_EMAIL,"user_id":"u1","added_at":NOW,"claimed_at":NOW,"notify_applications":True,"notify_messages":True}])
    return base.handler(route, request)
