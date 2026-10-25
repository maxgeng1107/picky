# Picky — as picky as you are

**Track 4 · AI-Powered Consumer Products for 1 Billion People**

## The problem
You shoot 80 photos of yourself on a day out and post maybe two. Picking those two takes forever, the other 78 eat your phone's storage, and every "best photo" feature picks by generic rules — sharpest, biggest smile, facing the camera — not by what *you* would keep.

## What Picky does
- **Works when you stop shooting.** Picky notices today's new photos; once you haven't shot anything for a while, it curates on its own and pings you once. You never open a cleaner app.
- **Splits your day into scenes** (by capture time) and keeps the 1–3 photos per scene that match *your* taste. Screenshots, food and scenery are left untouched — Picky only looks at photos of a person.
- **Asks only when it's unsure** — one quick A vs B inside a scene.
- **Learns your rule from your choices.** If you pick a side angle once and a frontal shot the next time, angle isn't your rule — Picky looks at what the two winners share (e.g. *your face looks smaller*) and ranks the next scene that way.
- **Frees space in one tap**: back up to Google Drive, then delete the rest from the phone (iOS confirms the deletion).

## How it works
- **Claude (vision) is the eyes.** One call per scene: is there a person, is it a usable shot (eyes open, sharp), and a 1–5 score on 8 criteria (face looks smaller, jawline, eyes, facing the camera, smile, camera height, light, expression), relative to the other photos in that scene.
- **Code is the memory.** Each A vs B answer compares the two photos' scores: criteria where the winner is clearly higher get +1 support, clearly lower get +1 against. Status (repeated support / mixed evidence / avoid) comes from those counts, so every number on the Taste screen is a real count, not something the model made up. Learning is instant and costs nothing.
- **Accuracy test built in:** mark the photo you picked beforehand in each scene; Picky shows how often its keepers include your pick after 0, 1, 2… answers, next to a generic app scored by the same rule.
- Stack: Expo (React Native) app, Expo Router API routes on the dev server for Claude scoring and Google Drive backup (keys never ship in the app), scores cached per scene.

## What's real vs. next
- Real: scoring with Claude on real photos, scene splitting, picking, A vs B learning, the taste panel, local notifications, deleting from the phone after confirmation.
- iOS doesn't let third-party apps run when a photo is taken, so detection happens when Picky is opened or its notification is tapped; a native build would curate nightly in the background (Android can trigger per photo).
- Google Drive backup is implemented; in the recorded demo it isn't connected, so removed photos go to Recently Deleted (kept 30 days).
- Next: learn new criteria when none of the 8 explains a choice; recognise *you* on-device so only your photos are touched; a shooting guide for whoever holds the camera ("step back two steps, use 2×").

## Team
Max Geng · Lingge
