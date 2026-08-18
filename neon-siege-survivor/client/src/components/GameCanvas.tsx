/**
 * Amberline Cataclysm: React is the tactical HUD frame; Babylon owns the 3D battle.
 * The HUD mode follows the live display dimensions so it never assumes one device shape.
 */

import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle } from "@/game/scene";
import { GAME_ASSETS } from "@/game/assets";
import type { GameSnapshot, IconId, UpgradeId } from "@/game/types";

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: "playing", health: 100, maxHealth: 100, damageFlash: 0, xp: 0, xpNeeded: 9, level: 1, kills: 0, seconds: 0, weaponTier: 1, weaponCount: 0, weaponLimit: 5, rerollsRemaining: 3, enemyCount: 0, attacks: [], upgrades: [],
};

const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const ModuleIcon = ({ id, className = "" }: { id: IconId; className?: string }) => <span className={`module-icon module-icon-${id} ${className}`} aria-hidden="true" />;
type ViewportMode = "portrait-narrow" | "portrait" | "landscape-compact" | "landscape" | "desktop";

const getViewportMode = (width: number, height: number): ViewportMode => {
  const aspect = width / Math.max(1, height);
  if (aspect < 0.68) return "portrait-narrow";
  if (aspect < 1) return "portrait";
  if (width < 960 && height < 600) return "landscape-compact";
  if (width < 1280) return "landscape";
  return "desktop";
};

export default function GameCanvas() {
  const mainRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const handleRef = useRef<GameHandle | null>(null);
  const joystickRef = useRef<HTMLElement>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() => getViewportMode(window.innerWidth, window.innerHeight));
  const demoMode = new URLSearchParams(window.location.search).has("demo");
  const searchParams = new URLSearchParams(window.location.search);
  const rerollPreview = Number(searchParams.get("reroll") ?? (searchParams.has("reroll") ? "1" : "0"));
  const forceUpgrade = searchParams.has("upgrade") || rerollPreview > 0;
  const forceModulePreview = new URLSearchParams(window.location.search).has("modules");
  const bossPreview = new URLSearchParams(window.location.search).has("boss");
  const strikerPreview = searchParams.has("striker");
  const idlePreview = searchParams.has("idle");
  const explosionPreview = searchParams.has("explosion");
  const bossExplosionPreview = searchParams.has("bossExplosion");
  const bossExplosionFarPreview = searchParams.has("bossExplosionFar");
  const debugMode = searchParams.has("debug");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    let cancelled = false;
    createGameScene(engine, canvas, { demoMode, forceUpgrade, forceModulePreview, bossPreview, strikerPreview, idlePreview, explosionPreview, bossExplosionPreview, bossExplosionFarPreview, debugMode, rerollPreview, onSnapshot: setSnapshot }).then((handle) => {
      if (cancelled) {
        handle.dispose();
        return;
      }
      handleRef.current = handle;
      engine.runRenderLoop(() => handle.scene.render());
    });
    const onResize = () => {
      engine.resize();
      const width = mainRef.current?.clientWidth ?? window.innerWidth;
      const height = mainRef.current?.clientHeight ?? window.innerHeight;
      const nextMode = getViewportMode(width, height);
      setViewportMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
    };
    const resizeObserver = new ResizeObserver(onResize);
    if (mainRef.current) resizeObserver.observe(mainRef.current);
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onResize);
      handleRef.current?.dispose();
      handleRef.current = null;
      engine.dispose();
      startedRef.current = false;
    };
  }, [demoMode, forceUpgrade, forceModulePreview, bossPreview, strikerPreview, idlePreview, explosionPreview, bossExplosionPreview, bossExplosionFarPreview, debugMode, rerollPreview]);

  const setDirection = (x: number, z: number) => handleRef.current?.setTouchDirection(x, z);
  const updateJoystick = (clientX: number, clientY: number) => {
    const pad = joystickRef.current;
    if (!pad) return;
    const bounds = pad.getBoundingClientRect();
    const range = bounds.width * 0.31;
    const rawX = clientX - (bounds.left + bounds.width / 2);
    const rawY = clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > range ? range / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    setStickOffset({ x, y });
    setDirection(x / range, -y / range);
  };
  const beginJoystick = (event: React.PointerEvent<HTMLElement>) => {
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event.clientX, event.clientY);
  };
  const moveJoystick = (event: React.PointerEvent<HTMLElement>) => {
    if (joystickPointerIdRef.current === event.pointerId) updateJoystick(event.clientX, event.clientY);
  };
  const endJoystick = (event: React.PointerEvent<HTMLElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    joystickPointerIdRef.current = null;
    setStickOffset({ x: 0, y: 0 });
    setDirection(0, 0);
  };
  const selectUpgrade = (id: UpgradeId) => handleRef.current?.chooseUpgrade(id);
  const rerollUpgrades = () => handleRef.current?.rerollUpgrades();
  const healthPercent = (snapshot.health / snapshot.maxHealth) * 100;
  const xpPercent = (snapshot.xp / snapshot.xpNeeded) * 100;

  return (
    <main ref={mainRef} className={`game-shell viewport-${viewportMode}`} aria-label="Neon Siege Survivor">
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />
      <div className="containment-floor-overlay" aria-hidden="true" />
      <img src={GAME_ASSETS.sigil} className="combat-sigil" alt="" aria-hidden="true" />
      <div className="threat-perimeter" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="safety-frame" aria-hidden="true"><span className="frame-code frame-code-a">LIVE GRID // 07-A</span><span className="frame-code frame-code-b">HOLD THE LINE</span></div>
      <div className="tactical-vignette" aria-hidden="true" />
      <section className="hud-layer" aria-live="polite">
        <header className="mission-bar">
          <div className="brand-lockup">
            <img src={GAME_ASSETS.sigil} className="brand-sigil" alt="" />
            <div><p className="eyebrow">CONTAINMENT // SECTOR 07</p><h1>NEON SIEGE<span>:</span> SURVIVOR</h1></div>
          </div>
          <div className="timer-panel"><span className="timer-label">SURVIVAL CLOCK</span><strong>{formatTime(snapshot.seconds)}</strong>{demoMode && <em>DEMO LINK ACTIVE</em>}</div>
          <div className="kills-panel"><span>HOSTILES PURGED</span><strong>{String(snapshot.kills).padStart(3, "0")}</strong><small>{snapshot.enemyCount} SIGNALS IN RANGE</small></div>
        </header>

        <aside className={`health-unit ${snapshot.damageFlash > 0 ? "damage-alert" : ""}`}>
          <div className="unit-header"><span>VITAL ARMOR</span><strong>{Math.ceil(snapshot.health)}<i>/{snapshot.maxHealth}</i></strong></div>
          <div className="meter health-meter"><i style={{ width: `${healthPercent}%` }} /></div>
          <p>OPERATOR // ALPHA-13</p>
        </aside>
        {snapshot.debugStatus && <aside className="combat-debug-panel">{snapshot.debugStatus}</aside>}

        <div className="xp-unit"><div className="xp-readout"><span>REACTOR SYNC // LV.{String(snapshot.level).padStart(2, "0")}</span><b>{snapshot.xp} / {snapshot.xpNeeded}</b></div><div className="meter xp-meter"><i style={{ width: `${xpPercent}%` }} /></div></div>

        <footer className="loadout-rail">
          <div className="loadout-mark">WPN<br/><strong>{String(snapshot.attacks.filter((attack) => attack.active).length).padStart(2, "0")}</strong></div>
          {snapshot.attacks.map((attack) => <div key={attack.id} className={`weapon-card ${attack.active ? "active" : "muted"}`}><ModuleIcon id={attack.iconId} className="weapon-glyph"/><div><b>{attack.label}</b><small>{attack.active ? `LV.${String(attack.tier).padStart(2, "0")} // ${attack.detail}` : attack.detail}</small></div></div>)}
          <div className="instruction"><kbd>W A S D</kbd><span>HOLD PERIMETER</span></div>
        </footer>

        <nav ref={joystickRef} className="touch-drive" aria-label="移動用バーチャルスティック" onPointerDown={beginJoystick} onPointerMove={moveJoystick} onPointerUp={endJoystick} onPointerCancel={endJoystick}>
          <span className="joystick-rings" aria-hidden="true" />
          <span className="joystick-knob" aria-hidden="true" style={{ transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)` }}><i /></span>
          <small>VECTOR<br/>DRIVE</small>
        </nav>
        <aside className="mobile-fire-status" aria-hidden="true"><span>WPN</span><b>AUTO<br/>FIRE</b><i /></aside>

        {snapshot.phase === "upgrade" && <div className="modal-layer"><section className="upgrade-console"><p className="modal-eyebrow">SIGNAL OVERRIDE ACCEPTED</p><h2>SELECT A FIELD<br/><em>MODIFICATION.</em></h2><p className="modal-copy">完全ランダムな3つの候補から、ひとつだけ承認してください。追加武器枠 {snapshot.weaponCount}/{snapshot.weaponLimit}。</p><div className="upgrade-actions"><button className="reroll-button" onClick={rerollUpgrades} disabled={snapshot.rerollsRemaining <= 0}>REROLL <span>{snapshot.rerollsRemaining}/3</span></button><small>候補を再抽選</small></div><div className="upgrade-grid">{snapshot.upgrades.map((upgrade, index) => <button key={upgrade.id} className="upgrade-card" onClick={() => selectUpgrade(upgrade.id)}><span className="choice-number">0{index + 1}</span><ModuleIcon id={upgrade.iconId} className="upgrade-symbol"/><span className="upgrade-code">{upgrade.code}</span><strong>{upgrade.title}</strong><small>{upgrade.description}</small><i>INSTALL</i></button>)}</div></section></div>}
        {snapshot.phase === "gameover" && <div className="modal-layer"><section className="failure-console"><p className="modal-eyebrow danger">CONTAINMENT BREACH</p><h2>SIGNAL<br/><em>LOST.</em></h2><div className="failure-stats"><span>TIME HELD <b>{formatTime(snapshot.seconds)}</b></span><span>HOSTILES PURGED <b>{snapshot.kills}</b></span></div><p>封鎖線は崩壊しました。装備を再同期し、次の出撃に備えてください。</p><button onClick={() => handleRef.current?.restart()}>RE-ENTER THE SIEGE <span>GO</span></button></section></div>}
      </section>
    </main>
  );
}
