# Heeyeon Birthday CD Case

A clear CD jewel case drawn in WebGL. Light bends through the plastic, the disc spins inside
with a pink holographic label, and the case turns round as its lid swings open.
Built with [three.js](https://threejs.org) on Next.js.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:9283.

| Do this | And this happens |
| --- | --- |
| Tap the case, or **O** | Open or close it |
| Drag the case | Turn it |
| **S** | Enable or disable disc rotation while music plays |
| **Space** or Play | Play or pause the selected YouTube video and disc |
| **Flip** | Turn the case to inspect the clear reverse |

## How it works

**The plastic.** [`src/components/cd-case/caseGeometry.js`](src/components/cd-case/caseGeometry.js)
builds the case as rods and sheets of clear plastic, in millimetres. Every rail, rib and hinge
knuckle is a rounded-rectangle profile swept along a path, and each vertex carries the rod's
centre line and cross-section. The rod shader uses them to refract a ray into the rod, find
where it leaves the profile, and bounce it around inside a few times, picking up a Fresnel
reflection and a little absorption at each wall. The flat panels are thin sheets with their
own cheaper shader.

**The light.** [`src/components/cd-case/shaders.js`](src/components/cd-case/shaders.js) holds a
small studio of softboxes, flags and lamps that is baked once into a cube map. Everything
reflects and refracts that room. The clear disc substrate uses dielectric Fresnel reflection,
Snell refraction, and absorption through a 1.2 mm thickness. The brightest sparks are picked out and streaked into
four-point stars at the end.

**The motion.** [`src/components/cd-case/CaseStage.js`](src/components/cd-case/CaseStage.js)
plays the open and close as hand-keyed curves for the turn, the lid and the spread, smoothed
with monotone cubic splines. Grabbing the case springs back when let go, and the case leans
toward the pointer. The tray, disc and lid are drawn back to front, each one refracting what's
already behind it, inside a scissor around the case.

**The disc.** [`src/components/cd-case/disc.js`](src/components/cd-case/disc.js) names the
print and where it starts and stops, in millimetres from the middle.
`public/cd-case/heeyeon-birthday.webp` is the birthday print, rasterized from the editable
`public/cd-case/heeyeon-birthday.svg`: pink Y2K artwork with six orbital strings, a guitar, and foil gradients.
The print is a square texture whose half-width is the
disc's 60 mm radius. Swap it for your own art to make your own disc.
The reverse omits the front label to give the requested clear-plastic appearance.
The renderer approximates transmission from screen-space layers; it does not trace light
through the ink or resolve every intersecting surface at every pixel.

## Birthday edition

Dedicated to Kim Heeyeon (희연), also known as 뚱치땅치 / Fingerstylish.
The design uses 17 November without fixing an age or birthday year.
Her role as LATENCY’s lead guitarist is described in the [band interview](https://www.iamraeiam.com/post/latency-on-their-debut-sound-and-band-identity);
her birth date is listed in her [profile](https://kpopping.com/profiles/idol/Heeyeon).

The visible YouTube player starts with the [official LATENCY music video](https://www.youtube.com/watch?v=qPWlHgx_Oc0).
Its playback events control the CD rotation. The track list also includes
[Autumn Leaves](https://www.youtube.com/watch?v=Qu0wtz6Z5RY),
[Heeyeon’s Show Champion fancam](https://www.youtube.com/watch?v=1B5FZbg3SOM), and
[Kim Taewon Class](https://www.youtube.com/watch?v=05WdRXGpsVU).
Playback starts after a visitor presses Play; if embedding is blocked, the panel
offers a direct YouTube link. No audio is downloaded or extracted from these videos.

## Letters for Heeyeon

Open `/letters` to write a public birthday letter and pin it to the paper wall.
Letters are saved on the server in SQLite, shared between visitors, and survive restarts.
The API validates names and messages, uses prepared SQL statements, prevents duplicate
retries, and allows one new letter per client address every 30 seconds. The wall loads
30 letters at a time; older letters remain available through “More little letters”.

Run with **Node.js 24 LTS** (the built-in `node:sqlite` API requires at least Node 22.13).
For self-hosting:

```bash
npm ci
npm run build
LETTERS_DATA_DIR=/var/lib/heeyeon-letters npm start -- --port 9283
```

Create that directory with write permission for the app user. Keep it on a persistent
local disk outside the deployment directory. Without `LETTERS_DATA_DIR`, development
stores messages in `.data/letters.sqlite` (ignored by git). Back up the SQLite database
using SQLite’s backup command, or stop the app before copying the data directory.
Use a single server with shared local storage, rather than separate disks per replica.

If using Nginx, overwrite `X-Real-IP` with `$remote_addr`, preserve the public `Host`,
block direct access to the app port, and set `LETTERS_TRUST_PROXY=true` so the rate
limit applies to individual visitors. Leave it unset when running without a trusted
proxy. Client addresses are hashed for the rate limit and expire after 24 hours.

Letters are immediately public. No moderation dashboard or private delivery to
Heeyeon is included. Run the storage/validation and playback-control tests with
`node --test tests/*.test.mjs`.

## Original credit

Vibe-coded by **Ann Nguyen** ([@ann_nnng](https://x.com/ann_nnng)) with
[TypingMind](https://typingmind.com). If you use, remix, or learn from this, a link back
is enough. See the [collection README](../README.md).
