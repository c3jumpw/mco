"""Takes every screenshot used by the guide and the tour, from the build served at BASE.

Run it through ../update.sh, which builds the app and serves it first.
"""
import sys
import guide_shots, access_shots, guide_steps, tour_test

guide_shots.run()    # admin pages, the wizard, job tabs, candidate phone screens (writes boxes.json)
access_shots.run()   # sharing a job: access card, reviewer and full-access views
guide_steps.run()    # activity steps: builder, library, presets, step answers, candidate step screens
tour_test.run() or sys.exit("The tour checks failed; see above.")   # also takes tour-desktop for What's new
