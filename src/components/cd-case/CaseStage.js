import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { journeyPose, JOURNEY_DURATION } from './journey.mjs';
import { CASE, HALF, HINGE, discGeometry, lidGeometry, playerGeometry, trayGeometry } from './caseGeometry';
import {
  BACKDROP_FRAG,
  BACKDROP_VERT,
  BRIGHT_FRAG,
  COPY_FRAG,
  DISC_FRAG,
  DISC_VERT,
  FINAL_FRAG,
  ROD_FRAG,
  ROD_VERT,
  ROOM_BAKE_FRAG,
  SCREEN_VERT,
  SHEET_FRAG,
  SHEET_VERT,
  STREAK_FRAG,
} from './shaders';

const PLAYER_BUTTONS = [
  [-64, 'power'], [-51, 'eject'], [-38, 'play'],
  [35, 'back'], [48, 'next'], [61, 'stop'],
];

const FOV = 28;
const IOR = 1.59;
const ABSORB = [0.0042, 0.003, 0.0026];
const DEPTH = 14;
const BACKDROP_Z = -70;
const LIGHT = new THREE.Vector3(-0.3, 0.48, 1).normalize();
const SPIN = THREE.MathUtils.degToRad(18);
const SPIN_EASE = 0.9;
const FIT = 0.6;
const DOCK_CLEAR = 84;
const MSAA = 4;
const ROOM_SIZE = 512;
const STARS = 1.6;
const STAR_THRESHOLD = 2.0;

const GRAB_RATE = 0.008;
const GRAB_YAW = 0.9;
const GRAB_TILT = 0.45;
const GRAB_K = 16;
const GRAB_C = 5.5;
const TAP_SLOP = 6;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function sway(t, motion) {
  return {
    y: 1.8 * Math.sin(t * 1.1) * motion,
    yaw: -0.2 + (0.1 * Math.sin(t * 0.9) + 0.03 * Math.sin(t * 2.1)) * motion,
    pitch: -0.12 + 0.045 * Math.sin(t * 0.7) * motion,
    roll: 0.03 + 0.018 * Math.sin(t * 0.5) * motion,
    lid: 0,
    spread: 0,
  };
}

function createStage(container, disc, { getPaused, getSpin, onOpen, onPlayer, onReturn, onControl, onReady, onFail }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = reduced ? 0 : 1;

  const canvas = document.createElement('canvas');
  canvas.className = 'cd-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'A clear CD jewel case with its disc spinning inside. Tap the case to open it, or drag it to turn it.',
  );
  container.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    canvas.remove();
    onFail?.();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.setClearColor(0xffffff, 0);
  const hdr =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = (samples) =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples,
      depthBuffer: samples > 0,
      stencilBuffer: false,
      resolveDepthBuffer: false,
    });
  const rtPage = target(0);
  const rt = [target(MSAA), target(MSAA)];
  const rtBright = target(0);
  const rtStarA = target(0);
  const rtStarB = target(0);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 4000);
  const opaque = new THREE.Scene();
  const hardware = new THREE.Scene();
  hardware.add(new THREE.HemisphereLight(0xffffff, 0x7c8c98, 2));
  const panelLight = new THREE.DirectionalLight(0xffffff, 3);
  panelLight.position.set(-120, -180, 260);
  hardware.add(panelLight);
  const glass = new THREE.Scene();
  const hits = new THREE.Scene();

  const disposables = [];
  const track = (d) => {
    disposables.push(d);
    return d;
  };

  const screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const screenQuad = track(new THREE.PlaneGeometry(2, 2));
  const pass = (frag, uniforms) => {
    const material = track(
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SCREEN_VERT,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(screenQuad, material));
    return { scene, material };
  };
  const copyMat = track(
    new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null } },
      vertexShader: SCREEN_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
    }),
  );
  const copyQuad = new THREE.Mesh(screenQuad, copyMat);
  copyQuad.frustumCulled = false;
  copyQuad.renderOrder = -10;
  const picked = {
    uTex: { value: rtPage.texture },
    uTexInside: { value: rtPage.texture },
    uRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const bright = pass(BRIGHT_FRAG, {
    ...picked,
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: STAR_THRESHOLD },
  });
  const streak = pass(STREAK_FRAG, {
    uTex: { value: null },
    uStep: { value: new THREE.Vector2() },
    uFalloff: { value: 0.7 },
  });
  const final = pass(FINAL_FRAG, {
    ...picked,
    uStarA: { value: rtStarA.texture },
    uStarB: { value: rtStarB.texture },
    uStars: { value: STARS },
  });

  const roomRT = new THREE.WebGLCubeRenderTarget(ROOM_SIZE, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const bake = pass(ROOM_BAKE_FRAG, { uFace: { value: 0 }, uSize: { value: ROOM_SIZE } });
  const bakeRoom = () => {
    for (let face = 0; face < 6; face++) {
      bake.material.uniforms.uFace.value = face;
      renderer.setRenderTarget(roomRT, face);
      renderer.render(bake.scene, screenCam);
    }
    renderer.setRenderTarget(null);
  };
  bakeRoom();

  const shadowOf = {
    uLight: { value: LIGHT.clone() },
    uTrayInv: { value: new THREE.Matrix4() },
    uLidInv: { value: new THREE.Matrix4() },
    uPlayerInv: { value: new THREE.Matrix4() },
    uScale: { value: 1 },
  };
  const backdrop = new THREE.Mesh(
    track(new THREE.PlaneGeometry(8000, 8000)),
    track(new THREE.ShaderMaterial({ uniforms: shadowOf, vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG })),
  );
  backdrop.position.z = BACKDROP_Z;
  backdrop.renderOrder = -10;
  opaque.add(backdrop);
  const depthOnly = track(new THREE.MeshBasicMaterial({ colorWrite: false }));
  glass.add(copyQuad);

  const samples = window.matchMedia('(pointer: coarse)').matches ? 1 : 2;

  const rodMaterial = () =>
    track(
      new THREE.ShaderMaterial({
        uniforms: {
          uBehind: { value: null },
          uRoom: { value: roomRT.texture },
          uRoomSize: { value: ROOM_SIZE },
          uProj: { value: camera.projectionMatrix },
          uDepth: { value: DEPTH },
          uIor: { value: IOR },
          uSamples: { value: samples },
          uAbsorb: { value: new THREE.Vector3(...ABSORB) },
        },
        vertexShader: ROD_VERT,
        fragmentShader: ROD_FRAG,
      }),
    );
  const sheetMaterial = () =>
    track(
      new THREE.ShaderMaterial({
        uniforms: {
          uIor: { value: IOR },
          uAbsorb: { value: new THREE.Vector3(...ABSORB) },
        },
        vertexShader: SHEET_VERT,
        fragmentShader: SHEET_FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 4,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      }),
    );

  const fixed = (mesh, scene) => {
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };

  const hitPlane = track(new THREE.PlaneGeometry(CASE, CASE));
  const hitMat = track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));

  function buildCase(art) {
    const tray = trayGeometry();
    const lid = lidGeometry();
    const player = playerGeometry();
    const discGeo = discGeometry();
    for (const g of [tray.rods, tray.sheets, lid.rods, lid.sheets, player.rods, player.sheets, player.lidRods, player.lidSheets, discGeo]) track(g);

    const trayRodMat = rodMaterial();
    const lidRodMat = rodMaterial();
    const playerRodMat = rodMaterial();
    const playerLidRodMat = rodMaterial();
    const discMat = track(
      new THREE.ShaderMaterial({
        uniforms: {
          uArt: { value: art },
          uArtIn: { value: disc.artIn },
          uPrintOut: { value: disc.printOut },
        },
        vertexShader: DISC_VERT,
        fragmentShader: DISC_FRAG,
      }),
    );

    const item = {
      trayRods: fixed(new THREE.Mesh(tray.rods, trayRodMat), glass),
      traySheets: fixed(new THREE.Mesh(tray.sheets, sheetMaterial()), glass),
      lidRods: fixed(new THREE.Mesh(lid.rods, lidRodMat), glass),
      lidSheets: fixed(new THREE.Mesh(lid.sheets, sheetMaterial()), glass),
      playerRods: fixed(new THREE.Mesh(player.rods, playerRodMat), glass),
      playerSheets: fixed(new THREE.Mesh(player.sheets, sheetMaterial()), glass),
      playerLidRods: fixed(new THREE.Mesh(player.lidRods, playerLidRodMat), glass),
      playerLidSheets: fixed(new THREE.Mesh(player.lidSheets, sheetMaterial()), glass),
      playerPanel: fixed(new THREE.Group(), hardware),
      discMesh: fixed(new THREE.Mesh(discGeo, discMat), opaque),
      discDepth: fixed(new THREE.Mesh(discGeo, depthOnly), glass),
      hitTray: fixed(new THREE.Mesh(hitPlane, hitMat), hits),
      hitLid: fixed(new THREE.Mesh(hitPlane, hitMat), hits),
      hitPlayer: fixed(new THREE.Mesh(track(new THREE.PlaneGeometry(168, 160)), hitMat), hits),
      hitPlayerLid: fixed(new THREE.Mesh(track(new THREE.PlaneGeometry(168, 160)), hitMat), hits),
      hitDisc: fixed(new THREE.Mesh(track(new THREE.CircleGeometry(60, 64)), hitMat), hits),
      trayRodMat,
      lidRodMat,
      playerRodMat,
      playerLidRodMat,
      mCase: new THREE.Matrix4(),
      mLid: new THREE.Matrix4(),
      mPlayer: new THREE.Matrix4(),
      mPlayerLid: new THREE.Matrix4(),
      depthPlayerLid: 0,
      playerVisible: false,
      depthPlayer: 0,
      depthTray: 0,
      depthLid: 0,
    };
    item.traySheets.renderOrder = 1;
    item.lidSheets.renderOrder = 1;
    item.playerSheets.renderOrder = 1;
    item.playerLidSheets.renderOrder = 1;
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = 256;
    displayCanvas.height = 64;
    const displayContext = displayCanvas.getContext('2d');
    displayContext.fillStyle = '#1d2529';
    displayContext.beginPath();
    displayContext.roundRect(0, 0, 256, 64, 9);
    displayContext.fill();
    displayContext.fillStyle = '#c9d4d5';
    displayContext.font = '20px monospace';
    displayContext.textAlign = 'center';
    displayContext.fillText('CD  /  01', 128, 40);
    const displayTexture = track(new THREE.CanvasTexture(displayCanvas));
    displayTexture.colorSpace = THREE.SRGBColorSpace;
    const display = new THREE.Mesh(track(new THREE.PlaneGeometry(44, 12)), track(new THREE.MeshBasicMaterial({ map: displayTexture, transparent: true, alphaTest: .1 })));
    display.rotation.x = Math.PI / 2;
    display.position.set(0, -82.25, -13);
    const displayShape = new THREE.Shape([[-23, -7], [23, -7], [23, 7], [-23, 7]].map(([x, y]) => new THREE.Vector2(x, y)));
    const metal = track(new THREE.MeshStandardMaterial({ color: 0xb9c6cc, metalness: .55, roughness: .27 }));
    const bezel = new THREE.Mesh(track(new THREE.ExtrudeGeometry(displayShape, { depth: .5, bevelEnabled: true, bevelThickness: .3, bevelSize: .6, bevelSegments: 3, steps: 1 })), metal);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(0, -81.2, -13);
    item.playerPanel.add(bezel);
    item.playerPanel.add(display);
    const iconTextures = {};
    for (const kind of [...PLAYER_BUTTONS.map(([, action]) => action), 'pause']) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#3e4a52';
      if (kind === 'power') {
        ctx.strokeStyle = '#3e4a52';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(64, 68, 34, -.32 * Math.PI, 1.32 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(64, 22); ctx.lineTo(64, 61); ctx.stroke();
      } else if (kind === 'stop') {
        ctx.fillRect(31, 31, 66, 66);
      } else if (kind === 'back' || kind === 'next') {
        if (kind === 'back') { ctx.translate(128, 0); ctx.scale(-1, 1); }
        for (const x of [20, 60]) {
          ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x + 40, 64); ctx.lineTo(x, 100); ctx.closePath(); ctx.fill();
        }
      } else if (kind === 'pause') {
        ctx.fillRect(36, 31, 17, 66);
        ctx.fillRect(75, 31, 17, 66);
      } else {
        ctx.beginPath();
        if (kind === 'eject') {
          ctx.moveTo(27, 72); ctx.lineTo(64, 29); ctx.lineTo(101, 72);
          ctx.closePath(); ctx.fill();
          ctx.fillRect(27, 84, 74, 12);
        } else {
          ctx.moveTo(39, 26); ctx.lineTo(97, 64); ctx.lineTo(39, 102);
          ctx.closePath(); ctx.fill();
        }
      }
      const texture = track(new THREE.CanvasTexture(canvas));
      texture.colorSpace = THREE.SRGBColorSpace;
      iconTextures[kind] = texture;
    }
    item.iconTextures = iconTextures;
    item.controlButtons = [];
    item.controlHits = [];
    const controlHitGeometry = track(new THREE.CylinderGeometry(5.2, 5.2, 3, 32));
    const buttonGeometry = track(new THREE.LatheGeometry([
      [0, -1.1], [2.5, -1.1], [2.9, -.9], [3.2, -.5], [3.2, .2], [2.8, .5], [0, .5],
    ].map(([radius, y]) => new THREE.Vector2(radius, y)), 48));
    const rimGeometry = track(new THREE.TorusGeometry(3.45, .3, 12, 48));
    const iconGeometry = track(new THREE.PlaneGeometry(3.5, 3.5));
    for (const [x, action] of PLAYER_BUTTONS) {
      const rim = new THREE.Mesh(rimGeometry, metal);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, -81.4, -13);
      item.playerPanel.add(rim);
      const button = new THREE.Mesh(buttonGeometry, metal);
      button.position.set(x, -81.7, -13);
      button.userData.action = action;
      item.playerPanel.add(button);
      item.controlButtons.push(button);
      const hit = fixed(new THREE.Mesh(controlHitGeometry, hitMat), hits);
      hit.userData = { action, x };
      item.controlHits.push(hit);
      const iconMaterial = track(new THREE.MeshBasicMaterial({ map: iconTextures[action], transparent: true, alphaTest: .2 }));
      const icon = new THREE.Mesh(iconGeometry, iconMaterial);
      icon.rotation.x = Math.PI / 2;
      icon.position.set(x, -82.85, -13);
      item.playerPanel.add(icon);
      button.userData.icon = icon;
      if (action === 'play') item.playIconMaterial = iconMaterial;
    }
    const portRim = new THREE.Mesh(track(new THREE.TorusGeometry(3.1, .45, 12, 48)), metal);
    portRim.rotation.x = Math.PI / 2;
    portRim.position.set(75, -81.4, -13);
    item.playerPanel.add(portRim);
    const port = new THREE.Mesh(track(new THREE.CircleGeometry(2.6, 48)), track(new THREE.MeshBasicMaterial({ color: 0x172127 })));
    port.rotation.x = Math.PI / 2;
    port.position.set(75, -81.5, -13);
    item.playerPanel.add(port);
    item.discDepth.renderOrder = -5;
    return item;
  }

  const pointer = { x: 0, y: 0, over: false };
  const lean = { x: 0, y: 0 };
  const grab = {
    active: false,
    start: null,
    last: null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flick: { x: 0, y: 0 },
    moved: 0,
    dist: 0,
  };
  const st = { t: 0, journey: 0, target: 0, spin: 0, spinRate: reduced ? 0 : SPIN, open: false, player: false, origin: sway(0, motion) };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let item = null;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let view = { w: 1, h: 1, openScale: 1 };

  const setOpenFlag = (on) => {
    if (st.open === on) return;
    st.open = on;
    onOpen?.(on);
  };

  function toggleOpen(on = !st.open) {
    if (!item || (st.journey > 0 && st.journey < JOURNEY_DURATION)) return;
    if (on) st.origin = sway(st.t, motion);
    st.target = on ? JOURNEY_DURATION : 0;
    setOpenFlag(on);
    if (!on) {
      st.player = false;
      onPlayer?.(false);
    }
  }

  function showPose(t) {
    const p = st.journey === 0 || st.target === 0 ? sway(t, motion) : { ...st.origin };
    const journey = journeyPose(st.journey);
    p.y *= 1 - journey.hinge;
    p.yaw *= 1 - journey.hinge;
    p.pitch *= 1 - journey.hinge;
    p.roll *= 1 - journey.hinge;
    p.lid = 3.05 * journey.hinge;
    p.spread = journey.hinge;
    return { ...p, ...journey };
  }

  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'XYZ');
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _h = new THREE.Matrix4();
  const _hi = new THREE.Matrix4();
  const discPosition = new THREE.Vector3();
  const discScale = new THREE.Vector3();
  const discRotation = new THREE.Quaternion();
  const landing = new THREE.Vector3(0, -20, 0);
  const playerLanding = new THREE.Vector3();
  const playerRotation = new THREE.Quaternion();

  function place(p) {
    const float = sway(st.t, motion);
    _e.set((float.pitch - .73 + lean.x + grab.x) * p.transfer, (float.yaw + .5 + lean.y + grab.y) * p.transfer, float.roll * p.transfer);
    playerRotation.setFromEuler(_e);
    playerLanding.copy(landing);
    playerLanding.y += float.y * .5 * p.transfer;
    _v.copy(playerLanding);
    _v.x += (CASE + view.across) * (1 - p.player);
    item.mPlayer.compose(_v, playerRotation, _s.setScalar(0.84));
    _h.makeTranslation(0, 76, 2);
    _hi.makeTranslation(0, -76, -2);
    _m.makeRotationX(-1.35 * p.player);
    item.mPlayerLid.copy(item.mPlayer).multiply(_h).multiply(_m).multiply(_hi);

    const s = lerp(1, view.openScale, p.spread);
    _e.set(p.pitch + (lean.x + grab.x) * (1 - p.hinge), p.yaw + (lean.y + grab.y) * (1 - p.hinge), p.roll);
    _q.setFromEuler(_e);
    _v.set(HALF * s * p.spread * 0.92, p.y, 0);
    item.mCase.compose(_v, _q, _s.setScalar(s));
    item.mCase.decompose(discPosition, discRotation, discScale);
    discPosition.z += 36 * p.lift;
    discPosition.y += 14 * p.lift;
    discPosition.lerp(playerLanding, p.transfer);
    discRotation.slerp(playerRotation, p.transfer);
    discScale.lerp(_s.setScalar(0.84), p.transfer);
    item.discMesh.matrix.compose(discPosition, discRotation, discScale).multiply(_m.makeRotationZ(-st.spin));
    item.discDepth.matrix.copy(item.discMesh.matrix);
    _h.makeTranslation(HINGE.x, 0, HINGE.z);
    _hi.makeTranslation(-HINGE.x, 0, -HINGE.z);
    _m.makeRotationY(-p.lid);
    item.mLid.copy(item.mCase).multiply(_h).multiply(_m).multiply(_hi);
    const caseExit = (CASE * 3 + view.across) * p.exit;
    item.mCase.elements[12] -= caseExit;
    item.mLid.elements[12] -= caseExit;

    // A separate clear player slides in while the complete empty case leaves.
    item.playerRods.matrix.copy(item.mPlayer);
    item.playerSheets.matrix.copy(item.mPlayer);
    item.playerPanel.matrix.copy(item.mPlayer);
    item.playerLidRods.matrix.copy(item.mPlayerLid);
    item.playerLidSheets.matrix.copy(item.mPlayerLid);
    item.playerVisible = p.player > 0;
    for (const button of item.controlButtons) {
      const pressed = grab.active && grab.control === button.userData.action;
      button.position.y = lerp(button.position.y, pressed ? -81.2 : -81.7, .25);
      button.userData.icon.position.y = button.position.y - 1.15;
    }
    const icon = getPaused() ? item.iconTextures.play : item.iconTextures.pause;
    if (item.playIconMaterial.map !== icon) {
      item.playIconMaterial.map = icon;
      item.playIconMaterial.needsUpdate = true;
    }
    if (st.player) {
      discPosition.project(camera);
      container.parentElement.style.setProperty('--player-disc-x', `${(discPosition.x + 1) * view.w / 2}px`);
      container.parentElement.style.setProperty('--player-disc-y', `${(1 - discPosition.y) * view.h / 2}px`);
    }

    item.trayRods.matrix.copy(item.mCase);
    item.traySheets.matrix.copy(item.mCase);
    item.lidRods.matrix.copy(item.mLid);
    item.lidSheets.matrix.copy(item.mLid);
    for (const hit of item.controlHits) {
      hit.matrix.copy(item.mPlayer).multiply(_m.makeTranslation(hit.userData.x, -82, -13));
      hit.matrixWorld.copy(hit.matrix);
    }
    item.hitPlayer.matrix.copy(item.mPlayer);
    item.hitPlayerLid.matrix.copy(item.mPlayerLid);
    item.hitDisc.matrix.copy(item.discMesh.matrix);
    item.hitTray.matrix.copy(item.mCase);
    item.hitLid.matrix.copy(item.mLid).multiply(_m.makeTranslation(0, 0, 4));
    for (const o of [
      item.trayRods,
      item.traySheets,
      item.lidRods,
      item.lidSheets,
      item.discMesh,
      item.discDepth,
      item.playerRods,
      item.playerSheets,
      item.playerPanel,
      item.playerLidRods,
      item.playerLidSheets,
      item.hitTray,
      item.hitLid,
      item.hitPlayer,
      item.hitPlayerLid,
      item.hitDisc,
    ]) {
      o.matrixWorld.copy(o.matrix);
      o.visible = true;
    }
    _v.set(0, 0, -2).applyMatrix4(item.mCase).applyMatrix4(camera.matrixWorldInverse);
    item.depthTray = _v.z;
    _v.set(0, 0, 4).applyMatrix4(item.mLid).applyMatrix4(camera.matrixWorldInverse);
    item.depthLid = _v.z;
    _v.set(0, 0, -3).applyMatrix4(item.mPlayer).applyMatrix4(camera.matrixWorldInverse);
    item.depthPlayer = _v.z;
    _v.set(0, 0, 3).applyMatrix4(item.mPlayerLid).applyMatrix4(camera.matrixWorldInverse);
    item.depthPlayerLid = _v.z;
    item.playerRods.visible = item.playerSheets.visible = item.playerPanel.visible = item.playerLidRods.visible = item.playerLidSheets.visible = item.playerVisible;

    shadowOf.uTrayInv.value.copy(item.mCase).invert();
    shadowOf.uLidInv.value.copy(item.mLid).invert();
    shadowOf.uPlayerInv.value.copy(item.mPlayer).invert();
    shadowOf.uScale.value = s;
  }

  const caseAt = (x, y) => {
    if (!item) return false;
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(st.player ? [item.hitPlayer, item.hitPlayerLid] : [item.hitTray, item.hitLid], false).length > 0;
  };

  const discAt = (x, y) => {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(item.hitDisc, false).length > 0;
  };

  const controlAt = (x, y) => {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(item.controlHits, false)[0]?.object.userData.action;
  };

  function frame(dt) {
    st.t += dt;
    const { t } = st;

    const want = !reduced && getSpin() && !getPaused() ? SPIN : 0;
    st.spinRate += (want - st.spinRate) * (1 - Math.exp(-dt * SPIN_EASE * 3));
    st.spin += st.spinRate * dt;

    const hover = !reduced && pointer.over && !grab.active && (st.journey === 0 || st.player);
    const ax = hover ? pointer.y * 0.22 : 0;
    const ay = hover ? -pointer.x * 0.35 : 0;
    const k = 1 - Math.exp(-dt * 4);
    lean.x += (ax - lean.x) * k;
    lean.y += (ay - lean.y) * k;
    if (!grab.active) {
      grab.vx += (-GRAB_K * grab.x - GRAB_C * grab.vx) * dt;
      grab.vy += (-GRAB_K * grab.y - GRAB_C * grab.vy) * dt;
      grab.x += grab.vx * dt;
      grab.y += grab.vy * dt;
    }

    st.journey = st.target > st.journey
      ? Math.min(st.target, st.journey + (reduced ? JOURNEY_DURATION : dt))
      : Math.max(st.target, st.journey - (reduced ? JOURNEY_DURATION : dt));
    if (st.journey === JOURNEY_DURATION && !st.player) {
      st.player = true;
      canvas.setAttribute('aria-label', 'A clear 3D CD player. Drag to turn it, or tap the CD to return it to the case.');
      onPlayer?.(true);
    } else if (st.journey === 0) {
      canvas.setAttribute('aria-label', 'A clear CD jewel case. Tap to open, or drag to turn it.');
    }

    camera.position.z = view.dist * lerp(1, 1.34, journeyPose(st.journey).player);
    camera.updateMatrixWorld();
    place(showPose(t));
    draw();
  }

  const _c = new THREE.Vector3();
  function caseRect(w, h) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const m of [item.mCase, item.mLid, ...(item.playerVisible ? [item.mPlayer, item.mPlayerLid] : [])]) {
      const half = m === item.mPlayer || m === item.mPlayerLid ? 87 : HALF + 3;
      for (let i = 0; i < 8; i++) {
        _c.set(i & 1 ? half : -half, i & 2 ? half : -half, i & 4 ? 7 : -28);
        _c.applyMatrix4(m).project(camera);
        x0 = Math.min(x0, _c.x);
        x1 = Math.max(x1, _c.x);
        y0 = Math.min(y0, _c.y);
        y1 = Math.max(y1, _c.y);
      }
    }
    const pad = 0.04 * Math.max(x1 - x0, y1 - y0) + 0.02;
    const px = (v) => Math.round(((v + 1) / 2) * w);
    const py = (v) => Math.round(((v + 1) / 2) * h);
    const r = {
      x: clamp(px(x0 - pad), 0, w),
      y: clamp(py(y0 - pad), 0, h),
      x1: clamp(px(x1 + pad), 0, w),
      y1: clamp(py(y1 + pad), 0, h),
    };
    return r.x1 > r.x && r.y1 > r.y ? r : null;
  }

  const groups = [];
  function draw() {
    renderer.setRenderTarget(rtPage);
    renderer.clear();
    renderer.render(opaque, camera);

    groups.length = 0;
    groups.push({ depth: item.depthTray, rods: item.trayRods, sheets: item.traySheets, mat: item.trayRodMat });
    groups.push({ depth: item.depthLid, rods: item.lidRods, sheets: item.lidSheets, mat: item.lidRodMat });
    if (item.playerVisible) {
      groups.push({ depth: item.depthPlayer, rods: item.playerRods, sheets: item.playerSheets, mat: item.playerRodMat });
      groups.push({ depth: item.depthPlayerLid, rods: item.playerLidRods, sheets: item.playerLidSheets, mat: item.playerLidRodMat });
    }
    groups.sort((a, b) => a.depth - b.depth);
    const glassMeshes = [item.trayRods, item.traySheets, item.lidRods, item.lidSheets, item.playerRods, item.playerSheets, item.playerLidRods, item.playerLidSheets];
    const w = rtPage.width;
    const h = rtPage.height;
    const rect = caseRect(w, h);
    let from = rtPage;
    if (rect) {
      for (const r of rt) {
        r.scissor.set(rect.x, rect.y, rect.x1 - rect.x, rect.y1 - rect.y);
        r.scissorTest = true;
      }
      groups.forEach((g, i) => {
        const into = rt[i % 2];
        renderer.setRenderTarget(into);
        renderer.clear();
        copyMat.uniforms.uTex.value = from.texture;
        for (const m of glassMeshes) m.visible = m === g.rods || m === g.sheets;
        g.mat.uniforms.uBehind.value = from.texture;
        renderer.render(glass, camera);
        from = into;
      });
      for (const r of rt) r.scissorTest = false;
    }
    for (const m of glassMeshes) m.visible = true;
    picked.uTexInside.value = from.texture;
    if (rect) picked.uRect.value.set(rect.x / w, rect.y / h, rect.x1 / w, rect.y1 / h);
    else picked.uRect.value.set(0, 0, 0, 0);

    bright.material.uniforms.uTexel.value.set(1 / rtBright.width, 1 / rtBright.height);
    renderer.setRenderTarget(rtBright);
    renderer.render(bright.scene, screenCam);
    streak.material.uniforms.uTex.value = rtBright.texture;
    streak.material.uniforms.uStep.value.set(1.5 / rtBright.width, 0);
    renderer.setRenderTarget(rtStarA);
    renderer.render(streak.scene, screenCam);
    streak.material.uniforms.uStep.value.set(0, 1.5 / rtBright.height);
    renderer.setRenderTarget(rtStarB);
    renderer.render(streak.scene, screenCam);

    renderer.setRenderTarget(null);
    renderer.render(final.scene, screenCam);
    renderer.clearDepth();
    renderer.render(hardware, camera);
  }

  function layout() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    rtPage.setSize(size.x, size.y);
    for (const r of rt) r.setSize(size.x, size.y);
    const hw = Math.max(1, Math.round(size.x / 2));
    const hh = Math.max(1, Math.round(size.y / 2));
    rtBright.setSize(hw, hh);
    rtStarA.setSize(hw, hh);
    rtStarB.setSize(hw, hh);
    camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitH = CASE / FIT / 2 / tanHalf;
    const fitW = (CASE * 1.3) / 2 / (tanHalf * camera.aspect);
    const dist = Math.max(fitH, fitW);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, 0, DOCK_CLEAR / 2, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const across = 2 * dist * tanHalf * camera.aspect;
    _c.copy(landing).project(camera);
    container.parentElement.style.setProperty('--player-disc-y', `${(1 - _c.y) * h / 2}px`);
    _c.set(60 * 0.84, landing.y, 0).project(camera);
    container.parentElement.style.setProperty('--player-disc-size', `${_c.x * w}px`);
    _c.set(0, -72, 0).project(camera);
    container.parentElement.style.setProperty('--player-controls-y', `${(1 - _c.y) * h / 2}px`);
    _c.set(61, 0, -8).project(camera);
    container.parentElement.style.setProperty('--player-controls-width', `${_c.x * w}px`);
    view = { w, h, dist, across, openScale: Math.min(1.04, across / (CASE * 2.25)) };
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(container);
  canvas.addEventListener('webglcontextrestored', bakeRoom);

  const toNdc = (e) => {
    const r = container.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
  };
  const onMove = (e) => {
    [pointer.x, pointer.y] = toNdc(e);
    pointer.over = true;
    if (grab.active) {
      const dx = e.clientX - grab.last.x;
      const dy = e.clientY - grab.last.y;
      grab.last = { x: e.clientX, y: e.clientY };
      grab.dist = Math.max(grab.dist, Math.hypot(e.clientX - grab.start.x, e.clientY - grab.start.y));
      grab.y = clamp(grab.y + dx * GRAB_RATE, -GRAB_YAW, GRAB_YAW);
      grab.x = clamp(grab.x + dy * GRAB_RATE, -GRAB_TILT, GRAB_TILT);
      grab.flick = { x: dy * GRAB_RATE * 60, y: dx * GRAB_RATE * 60 };
      grab.moved = performance.now();
    } else {
      const control = st.player && controlAt(pointer.x, pointer.y);
      container.style.cursor = control ? 'pointer' : caseAt(pointer.x, pointer.y) ? (st.player && !discAt(pointer.x, pointer.y) ? 'grab' : 'pointer') : '';
    }
  };
  const onLeave = () => {
    pointer.over = false;
  };
  const onDown = (e) => {
    if (!item || (st.journey > 0 && !st.player) || e.button !== 0) return;
    const [x, y] = toNdc(e);
    const control = st.player && controlAt(x, y);
    if (!caseAt(x, y) && !control) return;
    grab.control = control;
    grab.returnDisc = st.player && !control && discAt(x, y);
    grab.active = true;
    grab.start = { x: e.clientX, y: e.clientY };
    grab.last = { x: e.clientX, y: e.clientY };
    grab.dist = 0;
    grab.flick = { x: 0, y: 0 };
    container.setPointerCapture(e.pointerId);
    container.style.cursor = 'grabbing';
  };
  const onUp = (e) => {
    if (!grab.active) return;
    grab.active = false;
    const still = performance.now() - grab.moved > 90;
    grab.vx = still ? 0 : grab.flick.x;
    grab.vy = still ? 0 : grab.flick.y;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    container.style.cursor = '';
    if (e.type === 'pointerup' && grab.dist < TAP_SLOP) {
      if (!st.player) toggleOpen();
      else if (grab.control) onControl?.(grab.control);
      else if (grab.returnDisc && discAt(...toNdc(e))) onReturn?.();
    }
  };
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);

  const gaps = [];
  let probing = true;
  const probe = (gap) => {
    if (!probing || document.hidden || gap > 0.1) return;
    gaps.push(gap);
    if (gaps.length < 120) return;
    gaps.sort((a, b) => a - b);
    const typical = gaps[gaps.length >> 1];
    gaps.length = 0;
    const ratio = renderer.getPixelRatio();
    if (typical < 1 / 40 || ratio <= 1) {
      probing = false;
      return;
    }
    renderer.setPixelRatio(
      Math.max(1, Math.min(ratio - 0.25, Math.round(ratio * Math.sqrt(1 / 45 / typical) * 4) / 4)),
    );
    layout();
  };
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    const gap = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (!item) return;
    frame(Math.min(gap, 1 / 20));
    probe(gap);
  };

  new THREE.TextureLoader()
    .loadAsync(disc.art)
    .then((tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      item = buildCase(track(tex));
      layout();
      onReady?.();
      raf = requestAnimationFrame(tick);
    })
    .catch((err) => {
      console.error(err);
      if (!disposed) onFail?.();
    });

  layout();

  return {
    setOpen: (on) => toggleOpen(on),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextrestored', bakeRoom);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      for (const d of disposables) d.dispose();
      for (const r of [rtPage, ...rt, rtBright, rtStarA, rtStarB, roomRT]) r.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

const CaseStage = forwardRef(function CaseStage({ disc, paused = false, spin = true, onOpen, onPlayer, onReturn, onControl, onReady, onFail }, ref) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const callbacks = useRef({});
  callbacks.current = { onOpen, onPlayer, onReturn, onControl, onReady, onFail };

  useEffect(() => {
    const stage = createStage(containerRef.current, disc, {
      getPaused: () => pausedRef.current,
      getSpin: () => spinRef.current,
      onOpen: (on) => callbacks.current.onOpen?.(on),
      onPlayer: (on) => callbacks.current.onPlayer?.(on),
      onReturn: () => callbacks.current.onReturn?.(),
      onControl: (action) => callbacks.current.onControl?.(action),
      onReady: () => callbacks.current.onReady?.(),
      onFail: () => callbacks.current.onFail?.(),
    });
    stageRef.current = stage;
    return () => {
      stage?.dispose();
      stageRef.current = null;
    };
  }, [disc]);

  useImperativeHandle(ref, () => ({ setOpen: (on) => stageRef.current?.setOpen(on) }), []);

  return (
    <div
      className="cd-stage"
      ref={containerRef}
    />
  );
});

export default CaseStage;
