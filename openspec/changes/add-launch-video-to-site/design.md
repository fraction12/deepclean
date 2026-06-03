## Context

The current site is intentionally simple: product name, short description, install commands, links, and workflow. The launch video should add energy without bringing back the previous busy/futuristic marketing feel.

## Goals / Non-Goals

**Goals:**

- Make the launch video visible and easy to play.
- Keep the page direct and Cleeby-aligned.
- Ensure the video ships in the GitHub Pages build and local preview.

**Non-Goals:**

- Redesign the site layout.
- Add autoplaying audio or disruptive motion.
- Add additional marketing copy or new product claims.

## Decisions

- Place the video in a single section after the hero so the primary install path remains clear.
- Use native browser controls and no autoplay because the video includes audio.
- Use a poster frame so the section has a polished static appearance before playback.
- Copy only the required launch assets during `site:build` instead of publishing every file in `site/assets`.

## Risks / Trade-offs

- [Risk] Media could make the simple page feel heavier. -> Mitigation: keep the asset compact, use one section, and avoid extra copy.
- [Risk] Local preview could serve the MP4 with an incorrect MIME type. -> Mitigation: add explicit `.mp4` and `.jpg` types to the preview server.
