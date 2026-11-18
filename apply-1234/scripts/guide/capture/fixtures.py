"""Sample data and settings shared by the screenshot scripts. Everything here is made up."""
import base64, json, os, pathlib, time

HERE = pathlib.Path(__file__).parent
SHOTS = os.environ.get("SHOTS") or str(HERE.parent / "shots")     # raw PNGs (not committed)
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
BASE = os.environ.get("BASE", "http://localhost:4173")             # `vite preview` of the current build
ADMIN_EMAIL = "alex@yourcompany.com"                                # the admin shown in screenshots
os.makedirs(SHOTS, exist_ok=True)

# Every screenshot context starts with the tour already seen, so it never covers the page.
NO_TOUR = "try { localStorage.setItem('a1234_tour', JSON.stringify({'*': 999})); } catch (e) {}"

NOW = "2026-11-06T13:00:00Z"
JOB = {
  "id": "j1", "title": "Operations Coordinator", "status": "published", "notes": "Owns scheduling, vendor follow-ups, weekly reporting.",
  "posting": "## About the role\nYou'll keep our weekly operations running: scheduling, vendors, and reporting.\n\n{{part1}}\n\n## What you'll do\n- Run the weekly schedule\n- Follow up with vendors\n- Build the Friday report\n\n{{part2}}\n\n## What we're looking for\n- **Calm** under shifting priorities\n- Clear writer\n\n{{part3}}\n\n## How to apply\nRead this whole posting carefully. Pieces of the application link are hidden in it.",
  "domain": "apply1234.com", "slug": "harbor-472", "fragments": [{"text":"apply1234"},{"text":".com/"},{"text":"harbor-472"}],
  "hint_format": "Part {n} of {total}: {text}", "public_id": "abc123", "share_enabled": True,
  "activity": {"headline":"You found it.","intro":"Getting here meant reading the whole posting and piecing the link together. That is exactly the kind of attention this role needs.","loom_steps":"Create a free account at loom.com and install the desktop app.\nRecord one short video per question with your camera on.\nClick Copy link in Loom and paste it below.","answer_min":60,"answer_max":180,"extra":"Title each Loom **Q1 – Your Name**.","require_transcript":True,"hidden_code":"lantern","consent_text":"I agree my answers may be stored and reviewed, including with AI tools.","accommodations_email":"hiring@example.com","deadline":"2026-12-01T23:00:00Z"},
  "questions": [{"id":"q1","text":"Tell us about a time you had to figure something out with no instructions.","guidance":"Be specific: what happened and what you did."},{"id":"q2","text":"How would you organize a week where three vendors all slip deadlines?"}],
  "interview_questions": [{"id":"i1","text":"Walk me through your background.","kind":"general"},{"id":"i2","text":"How do you build the Friday report?","kind":"custom"}],
  "rubric": ["Clarity","Language level","Initiative","Role fit"], "booking_url": "https://calendly.com/x/interview",
  "settings": {}, "created_at": NOW, "updated_at": NOW, "published_at": NOW, "closed_at": None,
}
APP = {
  "id": "a1", "job_id": "j1", "name": "Jane Rivera", "email": "jane@example.com",
  "answers": [
    {"question_id":"q1","question":JOB["questions"][0]["text"],"url":"https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184","loom_id":"0281766fa2d04bb788eaf19e65135184","title":"Q1 – Jane lantern","duration_sec":142,"transcript":"So at my last job, nobody had documented the vendor process..."},
    {"question_id":"q2","question":JOB["questions"][1]["text"],"url":"https://www.loom.com/share/1281766fa2d04bb788eaf19e65135184","loom_id":"1281766fa2d04bb788eaf19e65135184","title":"Q2 – Jane","duration_sec":215,"transcript":"First I'd triage which deadline matters most..."}],
  "visitor_id":"v123","stage":"new","tags":["strong writer"],"consent":True,
  "flags":{"all_loom_links":True,"lengths_in_range":False,"transcripts_ok":True,"hidden_code_ok":True,"duplicate_email":False},
  "metrics":{"tz":"America/New_York","ua":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15","active_seconds":1840},
  "interview_at":None,"interview_answers":{},"interview_summary":"","submitted_at":NOW,"updated_at":NOW}
APP2 = dict(APP, id="a2", name="Marcus Lee", email="marcus@example.com", stage="shortlisted", tags=[], flags={"all_loom_links":False,"lengths_in_range":True,"transcripts_ok":True,"hidden_code_ok":False,"duplicate_email":True})
EVENTS = [
  {"id":1,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"wrong_url","path":"apply1234","meta":{},"created_at":"2026-11-06T10:00:00Z"},
  {"id":2,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"wrong_url","path":"harbor","meta":{"distance":4},"created_at":"2026-11-06T10:02:00Z"},
  {"id":3,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"arrival","path":"harbor-472","meta":{"ref":"indeed.com"},"created_at":"2026-11-06T10:05:00Z"},
  {"id":4,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"instructions_view","path":"","meta":{},"created_at":"2026-11-06T10:06:00Z"},
  {"id":5,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"instructions_done","path":"","meta":{},"created_at":"2026-11-06T10:09:30Z"},
  {"id":6,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"form_start","path":"","meta":{},"created_at":"2026-11-06T10:09:31Z"},
  {"id":7,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"tab_hidden","path":"","meta":{},"created_at":"2026-11-06T10:15:00Z"},
  {"id":8,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"tab_return","path":"","meta":{"away_ms":540000},"created_at":"2026-11-06T10:24:00Z"},
  {"id":9,"job_id":"j1","application_id":"a1","visitor_id":"v123","type":"submitted","path":"","meta":{},"created_at":"2026-11-06T10:48:00Z"},
]
STATS = [{"job_id":"j1","submissions":2,"new_count":1,"shortlisted":1,"interviews":0,"hired":0,"arrivals":14,"wrong_attempts":37,"wrong_visitors":19,"form_starts":9,"posting_views":40}]
def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
exp = int(time.time()) + 86400*30
JWT = b64({"alg":"HS256","typ":"JWT"}) + "." + b64({"sub":"u1","email":ADMIN_EMAIL,"exp":exp,"role":"authenticated","aud":"authenticated"}) + ".sig"
USER = {"id":"u1","email":ADMIN_EMAIL,"aud":"authenticated","role":"authenticated","app_metadata":{},"user_metadata":{},"created_at":NOW}
SESSION = {"access_token":JWT,"refresh_token":"r","expires_in":2592000,"expires_at":exp,"token_type":"bearer","user":USER}
