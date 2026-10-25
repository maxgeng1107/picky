# Picky — 2-minute pitch

*Spoken text in plain style. Lines in [brackets] are stage cues. ~2 minutes at a calm pace.*

---

**[0:00 — The problem]**

Today, in one hour on campus, I took **322 photos** of myself.
I'll post maybe two.

Everyone does this. You take ten versions of the same moment — a different smile, a different angle — and then you have to choose. That takes time, so you put it off. And all the photos you didn't choose just sit on your phone. That one hour was about **one gigabyte** of photos nobody wanted.

So there are two costs: **your time**, and **your storage**.

And the "best photo" features in our phones don't really help, because they pick the *technically* best shot — sharpest, biggest smile. Not the one *you* would post.

**[0:30 — What Picky is]**

So we built **Picky. As picky as you are.**

Picky is a photo curator that works **in the background**. You don't open it to sort. You just take photos.

**[0:40 — Why it's invisible]**

Here's the whole experience:

1. **You take photos.** Picky notices new photos of you — it ignores screenshots, food, scenery.
2. **When you stop shooting**, Picky waits a bit, then groups your photos into scenes, and in each scene it keeps the one to three shots you would post.
3. **You get one notification.** One tap, and the rest are backed up and cleared from your phone.

That's it. No gallery to scroll, no sorting screen. **The interface is one notification and one tap.**

**[1:00 — It learns you]** [show Your call / A vs B]

But how does it know what *you* like?

It learns like a **Nest thermostat**, or like **TikTok's feed**. Nest learns your temperature from the times you change it. TikTok learns from what you watch.
Picky learns from **the times you correct it.** If it removed a photo you like, you compare two photos — A or B — and Picky updates your taste.

[show Your taste]

And it finds the *real* reason. In our demo, I picked a side angle once, and a frontal shot the next time. Picky worked out that angle isn't my rule — **my face looking smaller** is.

**[1:25 — It disappears over time]**

At the start, Picky asks more, because it's learning you. But it gets quiet fast. In our demo, after just **two answers**, the questions it still needed to ask dropped **from 51 to 20**.

The goal: **you only confirm the cleanup. Picky already keeps your favorites.** The more you use it, the less you do.

**[1:40 — Trust]**

Your photos stay yours. Before anything is deleted, Picky backs it up to **your own private Google Drive** — not our servers. And your taste profile stays on your phone.

**[1:50 — Results and close]** [show "Freed ~998 MB"]

On my real photos today: **322 photos, 29 scenes, 55 kept, about one gigabyte freed** — with one tap.

**Picky saves your storage today, and saves more of your time every time you use it.**

Picky. **As picky as you are.**

---

## If you get questions (short answers)

- **"Does it really run in the background?"** — That's the design. iOS doesn't let apps run the moment a photo is taken, so today Picky checks when you open it, and reminds you when your shoot is over. A native app would run overnight while charging; Android can react to every new photo.
- **"How is this different from Google Photos or Apple?"** — They pick a generic "best" shot, and stacking or hiding photos doesn't free storage. Picky learns *your* rule and actually clears the space, with a backup first.
- **"Is the AI deciding everything?"** — The AI looks at photos and scores them. Your choices decide what matters. Picky only deletes after you confirm.
- **"What does the AI cost?"** — One AI call per scene, about 9 seconds. Learning from your answers is instant and free — it's just code.
- **"Privacy?"** — Backups go to your own Drive. To score photos, small resized copies go to the AI model; Picky doesn't store them.
- **"Does it really work?"** — Today we show the full pipeline on one real shoot. Measuring how often it matches each user's own picks on new photos is our next step — the app already has an accuracy test built in.
- **"Why women first?"** *(if asked)* — We start with people who shoot many portraits and post a few — the heaviest pain. The learning works for anyone.
