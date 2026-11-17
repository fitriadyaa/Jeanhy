import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const PlayerControls = forwardRef(function PlayerControls({ disc, active, onPlaying, onReturn }, ref) {
  const audio = useRef(null);
  const playButton = useRef(null);
  useEffect(() => { if (active) playButton.current?.focus({ preventScroll: true }); }, [active]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  function playback(value) {
    setPlaying(value);
    onPlaying(value);
  }

  async function toggle() {
    if (!active) return;
    if (!audio.current.paused) audio.current.pause();
    else await play();
  }

  async function play() {
    try {
      await audio.current.play();
      setError('');
    } catch {
      playback(false);
      setError('The track could not play. Please try again.');
    }
  }

  useImperativeHandle(ref, () => ({ toggle, play, returnToCase, control }));

  function returnToCase() {
    audio.current.pause();
    onReturn();
  }

  function control(action) {
    if (!active) return;
    if (action === 'eject') return returnToCase();
    if (action === 'play' || action === 'power') return toggle();
    if (action !== 'stop' && action !== 'back' && action !== 'next') return;
    if (action === 'stop') audio.current.pause();
    const end = audio.current.duration;
    if (!Number.isFinite(end)) return;
    const next = action === 'stop' ? 0 : audio.current.currentTime + (action === 'back' ? -10 : 10);
    audio.current.currentTime = Math.max(0, Math.min(end, next));
    setTime(audio.current.currentTime);
  }

  function updateDuration(event) {
    const value = event.currentTarget.duration;
    setDuration(Number.isFinite(value) ? value : 0);
  }

  return (
    <>
      <audio ref={audio} src="/cd-case/latency-instrumental.m4a" preload="metadata"
        onLoadedMetadata={updateDuration} onDurationChange={updateDuration}
        onTimeUpdate={(event) => { setTime(event.currentTarget.currentTime); updateDuration(event); }}
        onPlay={() => playback(true)} onPause={() => playback(false)} onEnded={() => playback(false)}
        onError={() => { playback(false); setError('The track is unavailable.'); }} />
      <button className="cd-disc-return" type="button" hidden={!active} onClick={returnToCase}
        aria-label="Return CD to case" title="Return CD to case" />
      <section className="cd-player-controls" aria-label="CD player" hidden={!active}>
        <div className="cd-player-heading">
          <div><p className="cd-player-label">{playing ? 'NOW PLAYING' : 'TAKE YOUR TIME'}</p><h2>{disc.name}</h2></div>
          <button ref={playButton} className="cd-player-play" type="button" onClick={toggle} aria-label={playing ? 'Pause music' : 'Play music'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={playing ? 'M6 4h4v16H6zM14 4h4v16h-4z' : 'M8 4v16l12-8z'} />
            </svg>
          </button>
        </div>
        <input className="cd-player-progress" type="range" aria-label="Playback position" aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
          min="0" max={duration || 1} step="0.1" value={time} disabled={!duration}
          style={{ '--progress': `${duration ? time / duration * 100 : 0}%` }}
          onChange={(event) => { audio.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)); }} />
        <div className="cd-player-times"><span>{formatTime(time)}</span><span>{formatTime(duration)}</span></div>
        <p className="cd-player-status" role="status">{error || 'LATENCY · Instrumental'}</p>
      </section>
      {active && <button className="cd-player-return" type="button" onClick={returnToCase}>← Back to the case</button>}
      <style jsx global>{`
        .cd-disc-return { position: absolute; top: var(--player-disc-y); left: var(--player-disc-x, 50%); transform: translate(-50%, -50%); pointer-events: none; width: var(--player-disc-size); height: var(--player-disc-size); border: 0; padding: 0; border-radius: 50%; background: transparent; cursor: pointer; }
        .cd-disc-return:focus-visible { outline: 2px solid #55555b; outline-offset: 5px; }
        .cd-player-controls { position: absolute; top: calc(var(--player-controls-y, 70%) + 16px); left: 50%; transform: translateX(-50%); width: min(var(--player-controls-width, 300px), 360px); padding: 14px 18px; border: 1px solid rgba(17, 17, 20, .08); border-radius: 20px; background: rgba(255, 255, 255, .72); box-shadow: 0 10px 30px -12px rgba(17, 17, 20, .16), inset 0 1px 0 #fff; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); color: #111114; animation: player-arrive .6s ease both; }
        .cd-player-controls[hidden] { display: none; }
        .cd-player-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .cd-player-label { margin: 0 0 5px; font-size: 8px; letter-spacing: .16em; color: rgba(17, 17, 20, .48); }
        .cd-player-heading h2 { margin: 0; font-size: clamp(12px, 1.6vw, 16px); font-weight: 500; letter-spacing: -.035em; line-height: 1.15; }
        .cd-player-play { flex: none; width: 42px; height: 42px; border: 1px solid rgba(17, 17, 20, .08); border-radius: 50%; background: rgba(255, 255, 255, .6); display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 4px rgba(17, 17, 20, .04); }
        .cd-player-play:hover { background: #fff; }
        .cd-player-progress { display: block; appearance: none; width: 100%; height: 24px; padding: 0; margin: 7px 0 0; background: transparent; cursor: pointer; }
        .cd-player-progress::-webkit-slider-runnable-track { height: 2px; background: linear-gradient(to right, #55555b var(--progress), rgba(17, 17, 20, .12) var(--progress)); border-radius: 2px; }
        .cd-player-progress::-moz-range-track { height: 2px; background: rgba(17, 17, 20, .12); }
        .cd-player-progress::-moz-range-progress { height: 2px; background: #55555b; }
        .cd-player-progress::-webkit-slider-thumb { appearance: none; width: 8px; height: 8px; margin-top: -3px; border-radius: 50%; background: #55555b; }
        .cd-player-progress::-moz-range-thumb { width: 8px; height: 8px; border: 0; border-radius: 50%; background: #55555b; }
        .cd-player-times { display: flex; justify-content: space-between; font-size: 9px; font-variant-numeric: tabular-nums; color: rgba(17, 17, 20, .48); }
        .cd-player-status { margin: 7px 0 0; font-size: 9px; color: rgba(17, 17, 20, .48); }
        .cd-player-return { position: absolute; top: max(18px, env(safe-area-inset-top)); right: max(18px, env(safe-area-inset-right)); padding: 12px 18px; border: 0; border-radius: 24px; background: transparent; color: rgba(17, 17, 20, .48); font-size: 11px; cursor: pointer; }
        .cd-player-return:hover { color: #111114; background: rgba(17, 17, 20, .03); }
        .cd-player-play:focus-visible, .cd-player-progress:focus-visible, .cd-player-return:focus-visible { outline: 2px solid #55555b; outline-offset: 4px; }
        @keyframes player-arrive { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
        @media (prefers-reduced-motion: reduce) { .cd-player-controls { animation: none; } }
        @media (max-width: 720px) {
          .cd-player-controls { top: auto; bottom: max(16px, env(safe-area-inset-bottom)); width: min(calc(100% - 32px), 360px); }
          .cd-player-heading > div { min-width: 0; }
          .cd-player-heading h2 { overflow-wrap: anywhere; }
          .cd-player-play { width: 44px; height: 44px; }
          .cd-player-progress { height: 44px; }
        }
        @media (max-height: 600px) { .cd-player-controls { padding: 9px 14px; } .cd-player-label { display: none; } .cd-player-play { width: 44px; height: 44px; } .cd-player-progress { margin-top: 0; } .cd-player-status { margin-top: 3px; } }
      `}</style>
    </>
  );
});

export default PlayerControls;
