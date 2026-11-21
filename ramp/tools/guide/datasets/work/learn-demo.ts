// @ts-nocheck
// A sample interactive module for the screenshot preview (Brightside Bakery is made up). Generated from the MCOA conversion.
export const LEARN_DEMO = {
 "id": "d0000000-0000-4000-8000-000000000001",
 "title": "Running the daily sync",
 "track": "role",
 "summary": "Practise the daily sync routine in practice versions of the tools you’ll use.",
 "minutes": 20,
 "objectives": [
  "Run the six-part sync framework",
  "Log requests as tasks to the standard",
  "Time-block priorities",
  "Triage the inbox and dump channel"
 ],
 "blocks": [
  {
   "type": "visual",
   "title": "The call framework",
   "layout": "steps",
   "items": [
    {
     "title": "Calendar forecast",
     "body": "Today and the next few days: conflicts, details, what to prepare."
    },
    {
     "title": "Pre-sync notes",
     "body": "Your flagged items. Two minutes each, maximum."
    },
    {
     "title": "Dump channel review",
     "body": "Confirm each item and where it goes."
    },
    {
     "title": "New items",
     "body": "Anything not yet logged, confirmed briefly."
    },
    {
     "title": "Prioritization",
     "body": "What matters most today and soon? What can wait?"
    },
    {
     "title": "Time blocking",
     "body": "Propose when the priorities get done, then adjust together."
    }
   ],
   "intro": "Turn the recorder on, then follow this every time."
  },
  {
   "type": "scenario",
   "title": "One item is eating the sync",
   "setup": "You’re 12 minutes into discussing a website redesign. Four items are left.",
   "question": "What do you do?",
   "choices": [
    {
     "text": "Suggest a separate workshop for the redesign, book it, and move on.",
     "result": "best",
     "feedback": "Over 3–5 minutes means its own workshop. The sync isn’t for solving one big thing."
    },
    {
     "text": "Keep going; it’s important.",
     "result": "poor",
     "feedback": "The rest of the day’s items lose their slot. Syncs should get shorter over time."
    },
    {
     "text": "Skip the remaining items today.",
     "result": "ok",
     "feedback": "Protects time, but loses items. Schedule the big one instead."
    }
   ]
  },
  {
   "type": "sort",
   "title": "Label the duration",
   "prompt": "How long will each take?",
   "groups": [
    "Quick task (1–30 min)",
    "Small project (30 min–2 h)",
    "Big project (2 h+)"
   ],
   "items": [
    {
     "text": "Confirm tomorrow’s dentist appointment",
     "group": 0
    },
    {
     "text": "Research three VPN options and compare prices",
     "group": 1
    },
    {
     "text": "Build the client onboarding SOP from four workshop transcripts",
     "group": 2
    },
    {
     "text": "Send the signed contract to the vendor",
     "group": 0
    },
    {
     "text": "Clean up and re-label last month’s inbox",
     "group": 1
    },
    {
     "text": "Map the full service fulfillment process end to end",
     "group": 2
    }
   ]
  },
  {
   "type": "sim",
   "tool": "tasks",
   "title": "Log the owner’s requests",
   "space": "Brightside Bakery",
   "lists": [
    "Admin tasks",
    "Orders and clients",
    "Personal"
   ],
   "brief": "After the sync, log each request as a task that meets the standard: verb-first title of five words or more, a real description, the right list, type, duration and priority. Then post the update the owner asked for.",
   "tasks": [
    {
     "title": "Renew the food handler permit online",
     "list": "Admin tasks",
     "status": "In progress",
     "description": "Permit expires on the 30th. Renew through the county portal and save the receipt."
    }
   ],
   "requests": [
    {
     "id": "r1",
     "from": "Owner",
     "text": "Can you order more cake boxes? We’re almost out, need them before Saturday.",
     "expect": {
      "list": "Admin tasks",
      "type": "Administrative",
      "duration": "Quick task",
      "priority": "High",
      "keywords": [
       "box",
       "saturday"
      ]
     },
     "why": "Supplies before a deadline: quick, high priority admin."
    },
    {
     "id": "r2",
     "from": "Owner",
     "text": "The Johnson wedding wants a tasting next week. Set it up with them.",
     "expect": {
      "list": "Orders and clients",
      "type": "Operational",
      "duration": "Quick task",
      "keywords": [
       "johnson",
       "tasting"
      ]
     },
     "why": "Client-facing and scheduling: operational, in the client list."
    },
    {
     "id": "r3",
     "from": "Owner",
     "text": "I want a proper checklist for closing the shop at night. Build it from how I do it.",
     "expect": {
      "list": "Admin tasks",
      "type": "Administrative",
      "duration": "Small project",
      "keywords": [
       "checklist",
       "clos"
      ]
     },
     "why": "Building a process is administrative and takes a little while."
    },
    {
     "id": "r4",
     "from": "Owner",
     "action": "comment",
     "task": "Renew the food handler permit online",
     "text": "Where are we on the permit? Put an update on the task.",
     "expect": {
      "keywords": [
       "permit|renew",
       "submitted|paid|waiting|done|portal"
      ]
     },
     "why": "Progress belongs in the task’s comments, where anyone can see it."
    }
   ]
  },
  {
   "type": "sim",
   "tool": "calendar",
   "title": "Time-block the priorities",
   "day": "Wednesday",
   "start": 8,
   "end": 18,
   "brief": "The sync agreed three priorities. Block them into Wednesday around the owner’s meetings, following what was agreed.",
   "events": [
    {
     "title": "Daily sync",
     "start": "09:00",
     "end": "09:30",
     "kind": "meeting"
    },
    {
     "title": "Supplier call",
     "start": "11:00",
     "end": "11:30",
     "kind": "meeting"
    },
    {
     "title": "Lunch with family",
     "start": "12:30",
     "end": "13:30",
     "kind": "personal"
    },
    {
     "title": "Client consult",
     "start": "15:00",
     "end": "16:00",
     "kind": "meeting"
    }
   ],
   "blocks": [
    {
     "id": "b1",
     "title": "Review the vendor contract",
     "minutes": 60,
     "after": "09:30",
     "before": "12:30",
     "why": "Agreed: before lunch, while the owner is sharpest."
    },
    {
     "id": "b2",
     "title": "Return customer calls",
     "minutes": 30,
     "after": "13:30",
     "before": "15:00",
     "why": "Agreed: right after lunch, before the consult."
    },
    {
     "id": "b3",
     "title": "Prep for the client consult",
     "minutes": 30,
     "after": "13:30",
     "before": "15:00",
     "why": "Prep has to come before the consult."
    },
    {
     "id": "b4",
     "title": "Inbox and dump channel sweep",
     "minutes": 30,
     "after": "16:00",
     "why": "End-of-day sweep so nothing waits overnight."
    }
   ]
  },
  {
   "type": "sim",
   "tool": "inbox",
   "title": "Pre-sync: the business inbox",
   "place": "hello@brightsidebakery.com",
   "brief": "It’s 8:15. The sync is at 9:30. Work the owner’s public inbox to zero: reply where you can, log what needs doing, and hold what needs the owner for the sync.",
   "messages": [
    {
     "id": "e1",
     "from": "Dana Ruiz",
     "subject": "Order for Saturday",
     "time": "7:52 AM",
     "body": "Hi! Can I still order two dozen cupcakes for pickup this Saturday? Vanilla please.",
     "expect": [
      "reply",
      "task"
     ],
     "why": "A customer asking something you can answer: reply quickly, then log the order.",
     "reply": {
      "mustInclude": [
       "saturday",
       "cupcake"
      ],
      "hint": "Confirm the order and the pickup day."
     }
    },
    {
     "id": "e2",
     "from": "Northside Flour Co.",
     "subject": "Invoice #4471 due Friday",
     "time": "6:30 AM",
     "body": "Your invoice for $812.40 is due this Friday. Pay online with the link below.",
     "expect": [
      "task"
     ],
     "why": "A bill with a deadline becomes a task with a due date so it isn’t missed."
    },
    {
     "id": "e3",
     "from": "Marcus (accountant)",
     "subject": "Q4 estimate — need a decision",
     "time": "Yesterday",
     "body": "Do you want to make the Q4 estimated payment now or wait until January? I need to know by next week.",
     "expect": [
      "sync",
      "forward"
     ],
     "why": "Only the owner can decide this. Bring it to the sync."
    },
    {
     "id": "e4",
     "from": "City Events Board",
     "subject": "Vendor fair Dec 14, booth confirmation",
     "time": "Yesterday",
     "body": "You’re confirmed for booth 12, Dec 14, 9am–3pm. Setup starts at 7:30.",
     "expect": [
      "calendar"
     ],
     "why": "A confirmed date and time goes straight on the calendar."
    },
    {
     "id": "e5",
     "from": "Promo Daily",
     "subject": "50% off all coupons today!!!",
     "time": "5:01 AM",
     "body": "Don’t miss our biggest sale of the year.",
     "expect": [
      "archive"
     ],
     "why": "Clutter. Clear it so the inbox stays at zero."
    }
   ]
  },
  {
   "type": "sim",
   "tool": "chat",
   "title": "Pre-sync: the dump channel",
   "place": "owner-daily-dump",
   "brief": "The owner dropped these in since yesterday’s sync. Decide what happens to each one before the sync starts.",
   "messages": [
    {
     "id": "c1",
     "from": "Owner",
     "time": "9:47 PM",
     "body": "need to renew the food handler permit, expires end of month i think",
     "expect": [
      "task"
     ],
     "why": "A clear to-do with a deadline: make it a task."
    },
    {
     "id": "c2",
     "from": "Owner",
     "time": "10:03 PM",
     "body": "idea: holiday gift boxes for corporate clients?? thoughts",
     "expect": [
      "sync"
     ],
     "why": "An idea that needs discussion belongs in the sync."
    },
    {
     "id": "c3",
     "from": "Owner",
     "time": "6:58 AM",
     "body": "dentist moved to thursday 2pm",
     "expect": [
      "calendar"
     ],
     "why": "A changed appointment: update the calendar."
    },
    {
     "id": "c4",
     "from": "Owner",
     "time": "7:20 AM",
     "body": "can you check if the new mixer shipped? order #88213",
     "expect": [
      "reply"
     ],
     "why": "A quick question you can answer: check and reply in the thread.",
     "reply": {
      "mustInclude": [
       "88213|mixer|order"
      ],
      "hint": "Acknowledge and say when you’ll have the answer."
     }
    },
    {
     "id": "c5",
     "from": "Owner",
     "time": "7:41 AM",
     "body": "remember: frosting ratio is 2 butter : 3 sugar for the big batches",
     "expect": [
      "note"
     ],
     "why": "Knowledge worth keeping: save it to the resource hub."
    }
   ]
  }
 ],
 "pass_score": 0,
 "mentor_review": false,
 "due_days": 7,
 "required": false,
 "guest_visible": false,
 "builtin": null,
 "status": "published",
 "sort": 40
};
