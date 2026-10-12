# Explainer videos

Finished explainer videos go here. The naming is fixed so the markup on the
homepage and the company pages does not have to change when a file is replaced.

| File | Holds |
| --- | --- |
| `mk-holding-co-intro.mp4` | The group video. This is the homepage intro. |
| `mk-holding-co-intro-poster.jpg` | First frame, shown before playback starts |
| `jump-tech-group.mp4` | JTG explainer, for `/projects/jump-tech-group` |
| `unywebs.mp4` | Unywebs explainer |
| `brand-craftsman.mp4` | The Brand Craftsman explainer |
| `mambay-kanu.mp4` | Mambay Kanu explainer |

Each video may also carry a poster frame on the same stem
(`unywebs-poster.jpg`) and a caption track (`unywebs.vtt`).

## Export settings

- H.264 in an MP4 container, yuv420p, 1280x720 or 1920x1080
- Move the moov atom to the front, so playback starts before the file finishes
  downloading (`ffmpeg -movflags +faststart`)
- Keep each file under 15 MB. GitHub refuses anything over 100 MB, and a heavy
  hero video costs more in bounced visitors than it gains in polish
- Burn subtitles into the render. The homepage intro plays muted by default

A WebM alongside the MP4 is optional. Every current browser plays H.264.

## Serving

Files in this folder are served from the site's own domain, so no content
security policy change is needed. The `/media` cache rule in `vercel.json`
already covers this folder. A third-party embed such as YouTube or Vimeo would
need a `frame-src` entry added to the policy first.

The source copy for every script lives in the MK Holding Co entity document.
