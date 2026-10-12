# Explainer video

The MK Holding Co explainer video goes here. The naming is fixed so the markup
on the homepage does not have to change when the file is replaced.

| File | Holds |
| --- | --- |
| `mk-holding-co-intro.mp4` | The group explainer. This is the homepage intro. |
| `mk-holding-co-intro-poster.jpg` | First frame, shown before playback starts |
| `mk-holding-co-intro.vtt` | Caption track, if exported separately |

Source copy for the video lives in the MK Holding Co explainer brief. The brief
describes the group by category rather than by company name, so the video does
not go stale when the roster changes. Keep any future company videos to the same
rule and name them for the company (`<company-slug>.mp4`).

## Export settings

- H.264 in an MP4 container, yuv420p, 1280x720 or 1920x1080
- Move the moov atom to the front, so playback starts before the file finishes
  downloading (`ffmpeg -movflags +faststart`)
- Keep the file under 15 MB. GitHub refuses anything over 100 MB, and a heavy
  hero video costs more in bounced visitors than it gains in polish
- Burn subtitles into the render. The homepage plays it muted by default

A WebM alongside the MP4 is optional. Every current browser plays H.264.

## Serving

Files in this folder are served from the site's own domain, so no content
security policy change is needed. The `/media` cache rule in `vercel.json`
already covers this folder. A third-party embed such as YouTube or Vimeo would
need a `frame-src` entry added to the policy first.
