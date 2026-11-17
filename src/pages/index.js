import PlayerControls from '@/components/cd-case/PlayerControls';
import CaseStage from '@/components/cd-case/CaseStage';
import { DISC } from '@/components/cd-case/disc';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

export default function CdCase() {
  const stageRef = useRef(null);
  const playerRef = useRef(null);
  const caseButton = useRef(null);
  const foilRef = useRef(null);
  const [player, setPlayer] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [spin, setSpin] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (document.getElementById('cd-case')?.getBoundingClientRect().top >= window.innerHeight / 2) return;
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (e.target.closest?.('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (player && (e.key === 'o' || e.key === 'O')) return;
      if (e.key === 'o' || e.key === 'O') stageRef.current?.setOpen();
      else if (!player && (e.key === 's' || e.key === 'S')) setSpin((s) => !s);
      else if (e.key === ' ') {
        e.preventDefault();
        if (player) playerRef.current?.toggle();
        else setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  function moveFoil(event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame = foilRef.current;
    const bounds = frame.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    frame.style.setProperty('--foil-x', `${x * 100}%`);
    frame.style.setProperty('--foil-y', `${y * 100}%`);
    frame.style.setProperty('--foil-angle', `${95 + x * 55 - y * 25}deg`);
  }

  function resetFoil() {
    const frame = foilRef.current;
    for (const property of ['--foil-x', '--foil-y', '--foil-angle']) frame.style.removeProperty(property);
  }

  return (
    <>
      <section className="opener" aria-label="Birthday sticker opener">
        <iframe
          className="opener-sticker"
          src="/holographic-sticker.html"
          title="Interactive holographic birthday sticker"
        />
      </section>
      <section className="birthday-marquee" aria-label="Happy birthday, our autumn girl, our guitar hero">
        <div className="birthday-frame" ref={foilRef} onPointerMove={moveFoil} onPointerLeave={resetFoil} onPointerCancel={resetFoil}>
          <div className="birthday-scroll" aria-hidden="true">
            {['HAPPY BIRTHDAY', 'OUR AUTUMN GIRL', 'OUR GUITAR HERO'].map((line, row) => (
              <div className="birthday-row" key={line} data-row={row}>
                <div className="birthday-track">
                  {[0, 1].map((copy) => (
                    <span className="birthday-copy" key={copy}>{line}<span className="birthday-star">✦</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <main
      id="cd-case"
      className="cd"
      data-ready={ready || undefined}
      data-open={open || undefined}
      data-player={player || undefined}
    >
      <Head>
        <title>Happy Birthday Heeyeon</title>
        <meta
          name="description"
          content="Happy birthday, Heeyeon — our autumn girl, our guitar hero. A little holographic magic and music, made for you."
        />
        <meta property="og:title" content="Happy Birthday Heeyeon" />
        <meta property="og:description" content="Happy birthday, Heeyeon — our autumn girl, our guitar hero. A little holographic magic and music, made for you." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Happy Birthday Heeyeon" />
        <meta name="twitter:description" content="Happy birthday, Heeyeon — our autumn girl, our guitar hero. A little holographic magic and music, made for you." />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>

      <CaseStage
        ref={stageRef}
        disc={DISC}
        paused={player ? !playing : paused}
        spin={player ? playing : spin}
        onOpen={(on) => { setOpen(on); if (on) playerRef.current?.play(); }}
        onPlayer={setPlayer}
        onReturn={() => playerRef.current?.returnToCase()}
        onControl={(action) => playerRef.current?.control(action)}
        onReady={() => setReady(true)}
        onFail={() => setFailed(true)}
      />

      <PlayerControls ref={playerRef} disc={DISC} active={player} onPlaying={setPlaying}
        onReturn={() => { stageRef.current?.setOpen(false); setPaused(false); requestAnimationFrame(() => caseButton.current?.focus()); }} />

      {failed && <p className="cd-fail">This page needs WebGL, and your browser couldn&apos;t start it.</p>}

      <h1 className="cd-sr">CD Case</h1>
      <p
        className="cd-sr"
        aria-live="polite"
      >
        {`${DISC.name}${player ? ', ready to play' : open ? ', lifting the disc' : ''}`}
      </p>

      <p
        className="cd-hint"
        aria-hidden="true"
      >
        {open ? 'A little room for music.' : 'Tap the case to listen · drag to turn it'}
      </p>

      <nav
        hidden={open}
        className="cd-dock"
        aria-label="Controls"
      >
        <button
          type="button"
          className="cd-tool"
          onClick={() => setSpin((s) => !s)}
          aria-label="Spin the disc"
          aria-pressed={spin}
          data-on={spin || undefined}
          title="Spin (S)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle
              cx="12"
              cy="12"
              r="8.5"
            />
            <circle
              cx="12"
              cy="12"
              r="2.4"
            />
            <path
              d="M12 5.8a6.2 6.2 0 0 1 6.2 6.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="cd-tool"
          onClick={() => stageRef.current?.setOpen()}
          ref={caseButton}
          aria-label={open ? 'Close the case' : 'Open the case'}
          aria-pressed={open}
          data-on={open || undefined}
          title="Open (O)"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="M11 5.5 3.5 7.8v10.4L11 18.5z" />
            <rect
              x="11"
              y="5.5"
              width="9.5"
              height="13"
              rx="1.4"
            />
            <circle
              cx="15.75"
              cy="12"
              r="2.6"
            />
          </svg>
        </button>
        <button
          type="button"
          className="cd-tool"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Play' : 'Pause'}
          aria-pressed={paused}
          title="Pause (Space)"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
          >
            {paused ? (
              <path
                d="M7 4.5v15l12.5-7.5z"
                fill="currentColor"
              />
            ) : (
              <path
                d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"
                fill="currentColor"
              />
            )}
          </svg>
        </button>
      </nav>

      <style
        jsx
        global
      >{`
        .birthday-marquee {
          position: relative;
          height: 180svh;
          color: #6550ad;
          view-timeline-name: --birthday;
          view-timeline-axis: block;
        }
        .birthday-frame {
          position: sticky;
          top: 0;
          height: 100svh;
          overflow: hidden;
          display: grid;
          align-items: center;
          background: radial-gradient(ellipse at 18% 22%, #e4eaff 0%, transparent 55%), radial-gradient(ellipse at 85% 75%, #eadcf7 0%, transparent 55%), #f8f6ff;
          isolation: isolate;
        }
        .birthday-frame::after {
          content: '';
          position: absolute;
          inset: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
          border: 1px solid rgba(101, 80, 173, .25);
          pointer-events: none;
          z-index: 1;
        }
        .birthday-scroll { width: 100%; min-width: 0; transform: rotate(-5deg) scale(1.08); }
        .birthday-row { padding: .025em 0 .08em; overflow: hidden; }
        .birthday-track {
          display: flex;
          width: max-content;
          animation: birthday-drift 24s linear infinite;
        }
        .birthday-row[data-row="1"] .birthday-track { animation-direction: reverse; animation-duration: 30s; }
        .birthday-row[data-row="1"] { color: transparent; -webkit-text-stroke: 1.5px #657bd0; }
        .birthday-copy {
          display: flex;
          align-items: center;
          flex: none;
          white-space: nowrap;
          font-family: Impact, 'Arial Narrow', sans-serif;
          font-size: clamp(72px, 13.5vw, 240px);
          font-weight: 900;
          line-height: .95;
          letter-spacing: -.045em;
        }
        .birthday-copy {
          background: radial-gradient(ellipse at var(--foil-x, 50%) var(--foil-y, 50%), #ffffff 0%, #e2f2ff 6%, transparent 28%), linear-gradient(var(--foil-angle, 115deg), #6550ad 0%, #9273d3 12%, #b7ceff 24%, #7d9de1 35%, #e2c8f4 46%, #faf1ff 50%, #a7d4ed 56%, #8b73c8 70%, #c5b3ec 84%, #6550ad 100%);
          background-size: 250% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          animation: birthday-foil 9s ease-in-out infinite alternate;
        }
        .birthday-row[data-row="1"] .birthday-copy {
          -webkit-text-stroke: 1px rgba(101, 123, 208, .65);
          background-image: radial-gradient(ellipse at var(--foil-x, 50%) var(--foil-y, 50%), #fff 0%, #d2e9ff 10%, transparent 35%), linear-gradient(var(--foil-angle, 115deg), #d5c5f4, #f7f3ff 24%, #b1cafa 40%, #eee0fc 52%, #8a96dc 70%, #d5c5f4);
          animation-delay: -3s;
        }
        .birthday-star { display: inline-block; padding: 0 .28em; color: #809aeb; -webkit-text-stroke: 0; font-size: .65em; }
        @keyframes birthday-foil {
          from { background-position: 0% 50%; }
          to { background-position: 100% 50%; }
        }
        @keyframes birthday-drift { to { transform: translateX(-50%); } }
        @keyframes birthday-scroll {
          from { transform: rotate(-9deg) scale(.86); }
          50% { transform: rotate(-3deg) scale(1.08); }
          to { transform: rotate(5deg) scale(1.22); }
        }
        @keyframes birthday-aperture {
          from { clip-path: inset(12% 7% round 32px); }
          40%, 75% { clip-path: inset(0% 0% round 0px); }
          to { clip-path: inset(6% 3% round 24px); }
        }
        @keyframes sticker-depart {
          from { transform: scale(1) rotate(0deg); opacity: 1; }
          to { transform: scale(.72) rotate(-8deg); opacity: 0; }
        }
        @keyframes case-arrive {
          from { transform: translateY(12svh) scale(.8); }
          to { transform: translateY(0) scale(1); }
        }
        @supports (animation-timeline: view()) {
          .opener { --opener-height: 140svh; view-timeline-name: --opener; }
          .opener .opener-sticker {
            position: sticky;
            top: 0;
            flex: none;
            height: 100svh;
            transform-origin: 50% 55%;
            animation: sticker-depart linear both;
            animation-timeline: --opener;
            animation-range: exit 0% exit 100%;
          }
          .cd { view-timeline-name: --case; }
          .cd-stage {
            animation: case-arrive linear both;
            animation-timeline: --case;
            animation-range: entry 0% entry 100%;
          }
          .birthday-scroll {
            animation: birthday-scroll linear both;
            animation-timeline: --birthday;
          }
          .birthday-frame {
            animation: birthday-aperture linear both;
            animation-timeline: --birthday;
          }
        }
        @media (max-width: 720px) {
          .birthday-copy { font-size: clamp(56px, 18vw, 120px); }
          .birthday-row { padding-block: 10px; }
          .cd[data-player] .cd-stage { bottom: calc(200px + env(safe-area-inset-bottom)); }
        }
        @media (max-height: 500px) and (min-width: 480px) {
          .birthday-copy { font-size: min(13.5vw, 20svh); }
          .birthday-row { padding-block: 5px; }
          .cd[data-player] .cd-stage { right: calc(300px + env(safe-area-inset-right)); bottom: 0; }
          .cd[data-player] { --player-disc-x: calc((100% - 300px - env(safe-area-inset-right)) / 2); }
        }
        @media (prefers-reduced-motion: reduce) {
          .opener { --opener-height: 100svh; }
          .opener .opener-sticker, .cd-stage { animation: none; transform: none; opacity: 1; }
          .birthday-marquee { height: auto; }
          .birthday-frame { position: relative; min-height: 65svh; height: auto; padding: 48px 24px; animation: none; }
          .birthday-scroll, .birthday-track { animation: none; transform: none; }
          .birthday-track { width: 100%; }
          .birthday-copy { width: 100%; white-space: normal; font-size: clamp(36px, 9vw, 100px); display: block; text-align: center; animation: none; }
          .birthday-copy + .birthday-copy, .birthday-star { display: none; }
        }
        .opener {
          height: var(--opener-height, 100svh);
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .opener-sticker {
          display: block;
          width: 100%;
          flex: 1;
          min-height: 0;
          border: 0;
        }
        .cd {
          --ink: #111114;
          --faint: rgba(17, 17, 20, 0.08);
          position: relative;
          height: 100svh;
          overflow: hidden;
          background: #ffffff;
          color: var(--ink);
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .cd-stage {
          position: absolute;
          inset: 0;
          touch-action: pan-y pinch-zoom;
        }
        .cd-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .cd[data-ready] .cd-canvas {
          opacity: 1;
        }
        .cd-sr {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .cd-fail {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          margin: 0;
          max-width: 80vw;
          text-align: center;
          font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          color: rgba(17, 17, 20, 0.6);
        }

        .cd-corner {
          position: absolute;
          top: max(18px, env(safe-area-inset-top));
          left: max(18px, env(safe-area-inset-left));
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          transition: opacity 0.6s ease 0.2s;
        }
        .cd:not([data-ready]) .cd-corner {
          opacity: 0;
        }
        .cd-corner a {
          color: var(--ink);
          text-decoration: none;
          transition: opacity 0.25s ease;
        }
        .cd-corner a:hover {
          opacity: 0.7;
        }
        .cd-corner a:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .cd-badge {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        .cd-corner .cd-tag {
          font-size: 12px;
          color: rgba(17, 17, 20, 0.5);
        }
        .cd-badge-mark {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .cd-badge-mark img {
          width: 20px;
          height: 20px;
          border-radius: 5px;
        }
        .cd-typing {
          color: #0d1526;
        }
        .cd-mind {
          color: #3b82f6;
        }
        .cd-corner .cd-credit {
          font-size: 12px;
          color: rgba(17, 17, 20, 0.5);
        }
        .cd-credit strong {
          font-weight: 400;
        }

        .cd-hint {
          position: absolute;
          left: 50%;
          bottom: calc(max(24px, env(safe-area-inset-bottom)) + 76px);
          transform: translateX(-50%);
          margin: 0;
          white-space: nowrap;
          pointer-events: none;
          font: 11.5px/1 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          letter-spacing: 0.01em;
          color: rgba(17, 17, 20, 0.42);
          transition: opacity 0.8s ease 0.6s;
        }
        .cd:not([data-ready]) .cd-hint {
          opacity: 0;
        }

        .cd-dock {
          position: absolute;
          left: 50%;
          bottom: max(24px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px;
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid var(--faint);
          box-shadow: 0 10px 30px -12px rgba(17, 17, 20, 0.18);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          transition: opacity 0.8s ease 0.2s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        }
        .cd:not([data-ready]) .cd-dock {
          opacity: 0;
          transform: translate(-50%, 12px);
        }
        .cd-dock[hidden] { display: none; }
        .cd[data-player] .cd-hint { opacity: 0; }
        @media (prefers-reduced-motion: reduce) {
          .cd-canvas, .cd-hint, .cd-dock, .cd-corner { transition: none; }
        }
        .cd-tool {
          flex: none;
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          transition: background 0.25s ease, color 0.25s ease;
        }
        .cd-tool:hover {
          background: rgba(17, 17, 20, 0.05);
        }
        .cd-tool:focus-visible {
          outline: 1px solid var(--ink);
          outline-offset: 2px;
        }
        .cd-tool[data-on] {
          background: var(--ink);
          color: #ffffff;
        }

        @media (max-width: 720px) {
          .cd-dock {
            gap: 2px;
            padding: 5px;
            bottom: max(16px, env(safe-area-inset-bottom));
          }
          .cd-tool {
            width: 44px;
            height: 44px;
          }
          .cd-hint {
            bottom: calc(max(16px, env(safe-area-inset-bottom)) + 72px);
            width: calc(100% - 32px);
            white-space: normal;
            text-align: center;
            line-height: 1.5;
            font-size: 11px;
          }
        }
      `}</style>
      </main>
    </>
  );
}
