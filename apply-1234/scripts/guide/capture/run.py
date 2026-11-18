"""Base mock of Supabase for the screenshot scripts: answers REST, RPC and auth calls with fixtures."""
import json, re
from fixtures import *

def handler(route, request):
    url = request.url
    accept = request.headers.get("accept", "")
    def ok(body, status=200):
        route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
    if "/api/loom" in url:
        return ok({"ok": True, "id": "0281766fa2d04bb788eaf19e65135184", "title": "Q1 – Jane lantern", "duration": 142})
    if "/auth/v1/user" in url: return ok(USER)
    if "/rpc/hiring_resolve" in url:
        body = json.loads(request.post_data or "{}")
        if body.get("p_path","").strip("/") == "harbor-472":
            return ok({"found": True, "closed": False, "job_id": "j1", "title": JOB["title"], "activity": {k:v for k,v in JOB["activity"].items() if k!="hidden_code"}, "questions": JOB["questions"]})
        return ok({"found": False})
    if "/rpc/hiring_track" in url: return route.fulfill(status=204, body="")
    if "/rpc/hiring_submit" in url: return ok({"ok": True, "id": "a9"})
    if "/rpc/hiring_public_posting" in url: return ok({"title": JOB["title"], "posting": JOB["posting"], "fragments": JOB["fragments"], "hint_format": JOB["hint_format"]})
    if "/rpc/hiring_claim_admin" in url: return ok(True)
    if "/rpc/hiring_job_stats" in url: return ok(STATS)
    if request.method in ("PATCH", "DELETE"): return route.fulfill(status=204, body="")
    single = "vnd.pgrst.object" in accept
    m = re.search(r"/rest/v1/(\w+)", url)
    table = m.group(1) if m else ""
    data = {"hiring_jobs": [JOB], "hiring_applications": [APP, APP2], "hiring_events": EVENTS,
            "hiring_reviews": [{"id":"r1","application_id":"a1","reviewer_id":"u2","reviewer_email":"sam@example.com","scores":{},"criteria":{},"overall":4,"recommendation":"yes","updated_at":NOW}],
            "hiring_notes": [{"id":"n1","application_id":"a1","author_email":"sam@example.com","kind":"note","body":"Great energy in Q1.","created_at":NOW}],
            "hiring_templates": [{"id":"t1","kind":"activity","name":"Standard Loom activity","content":JOB["activity"],"created_at":NOW}],
            "hiring_posting_versions": [], "hiring_admins": [{"email":ADMIN_EMAIL,"user_id":"u1","added_at":NOW,"claimed_at":NOW}]}.get(table, [])
    if request.method == "POST":
        row = json.loads(request.post_data or "{}")
        if isinstance(row, list): row = row[0]
        return ok(row if single else [row], 201)
    if "id=eq.a2" in url: data = [APP2]
    elif "id=eq.a1" in url and table == "hiring_applications": data = [APP]
    return ok((data[0] if data else None) if single else data)
