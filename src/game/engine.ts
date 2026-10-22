import { CONFIG, LEVEL_GROWTH, type ClassId, type WeaponId } from './config';

type Vec = { x: number; y: number };
type Enemy = Vec & { id: number; hp: number; hitWait: number; wobble: number };
type Orb = Vec & { id: number; value: number };
type HealingOrb = { id: number; value: number };
type Shot = Vec & { id: number; vx: number; vy: number; damage: number; kind: 'orb' | 'arrow'; life: number };
export type GameSnapshot = {
  player: Vec & { hp: number; maxHp: number; level: number; xp: number; nextXp: number };
  enemies: Enemy[]; xpOrbs: Orb[]; healingOrbs: HealingOrb[]; shots: Shot[]; wave: number; elapsed: number;
  weapon: WeaponId; classId: ClassId; showRange: boolean; cameraFull: boolean; dead: boolean; kills: number;
};
type InputState = { x: number; y: number };

export class GameEngine {
  readonly world = CONFIG.map.size;
  state: GameSnapshot;
  private keys = new Set<string>();
  private input: InputState = { x: 0, y: 0 };
  private nextId = 1;
  private waveTimer = 0;
  private attackTimer = 0;
  private elapsed = 0;
  private lastTime = 0;
  private animation = 0;
  private levelStats = { speed: 0, armor: 0, dodge: 0, attackSpeed: 0 };
  private enemyDamageTimer = 0;
  private druidRegenTimer = 0;
  private druidOrbHealTimer = 0;

  constructor(private onUpdate: (state: GameSnapshot) => void) {
    this.state = this.freshState();
    this.spawnWave(); // A primeira onda nasce uma única vez ao iniciar o motor.
  }

  private freshState(): GameSnapshot {
    return {
      player: { x: this.world / 2, y: this.world / 2, hp: CONFIG.player.maxHealth, maxHp: CONFIG.player.maxHealth, level: 0, xp: 0, nextXp: CONFIG.xp.levelBase },
      enemies: [], xpOrbs: [], healingOrbs: [], shots: [], wave: 1, elapsed: 0, weapon: 'espada', classId: 'druida',
      showRange: false, cameraFull: false, dead: false, kills: 0,
    };
  }

  start() {
    if (this.state.dead) return;
    this.lastTime = performance.now();
    this.animation = requestAnimationFrame(this.loop);
  }
  stop() { cancelAnimationFrame(this.animation); this.animation = 0; }
  setKey(key: string, down: boolean) { if (this.state.dead) return; down ? this.keys.add(key.toLowerCase()) : this.keys.delete(key.toLowerCase()); }
  setMove(x: number, y: number) { if (this.state.dead) return; this.input = { x, y }; }
  setWeapon(weapon: WeaponId) { if (this.state.dead || this.state.weapon === weapon) return; this.state.weapon = weapon; this.emit(); }
  setClass(classId: ClassId) { if (this.state.dead || this.state.classId === classId) return; this.state.classId = classId; this.druidRegenTimer = 0; this.druidOrbHealTimer = 0; this.emit(); }
  toggleCamera() { if (this.state.dead) return; this.state.cameraFull = !this.state.cameraFull; this.emit(); }
  toggleRange() { if (this.state.dead) return; this.state.showRange = !this.state.showRange; this.emit(); }
  restart() {
    this.stop(); this.state = this.freshState(); this.nextId = 1; this.waveTimer = 0; this.attackTimer = 0;
    this.elapsed = 0; this.levelStats = { speed: 0, armor: 0, dodge: 0, attackSpeed: 0 };
    this.enemyDamageTimer = 0; this.druidRegenTimer = 0; this.druidOrbHealTimer = 0; this.keys.clear(); this.input = { x: 0, y: 0 }; this.spawnWave(); this.start(); this.emit();
  }
  private emit() { this.onUpdate({ ...this.state, player: { ...this.state.player }, enemies: [...this.state.enemies], xpOrbs: [...this.state.xpOrbs], healingOrbs: [...this.state.healingOrbs], shots: [...this.state.shots] }); }

  // Só valores apresentados na interface participam da comparação; posições e animações ficam no Canvas.
  private visibleStateKey() {
    const s = this.state;
    return [
      Math.floor(s.elapsed), s.player.hp, s.player.maxHp, s.player.level,
      s.player.xp, s.player.nextXp, s.wave, s.weapon, s.classId, s.healingOrbs.length, s.showRange,
      s.cameraFull, s.dead, s.kills,
    ].join('|');
  }

  private loop = (now: number) => {
    if (this.state.dead) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.04); this.lastTime = now;
    const previousVisibleState = this.visibleStateKey();
    this.update(dt);
    if (this.visibleStateKey() !== previousVisibleState) this.emit();
    if (this.state.dead) { this.stop(); return; }
    this.animation = requestAnimationFrame(this.loop);
  };
  private update(dt: number) {
    this.elapsed += dt; this.state.elapsed = this.elapsed;
    this.waveTimer += dt; this.attackTimer += dt; this.enemyDamageTimer -= dt;
    const p = this.state.player;
    let dx = this.input.x, dy = this.input.y;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    const mag = Math.hypot(dx, dy); if (mag > 1) { dx /= mag; dy /= mag; }
    const speed = CONFIG.player.speed + this.levelStats.speed;
    p.x = this.clamp(p.x + dx * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);
    p.y = this.clamp(p.y + dy * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);

    if (this.waveTimer >= CONFIG.waves.interval) { this.waveTimer = 0; this.state.wave += 1; this.spawnWave(); }
    this.moveEnemies(dt); this.moveShots(dt); this.autoAttack(); this.collectXp();
    if (this.state.classId === 'druida') {
      this.druidRegenTimer = Math.max(0, this.druidRegenTimer - dt);
      if (this.druidRegenTimer > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 1.2 * dt);
      this.druidOrbHealTimer -= dt;
      if (p.hp > 0 && p.hp / p.maxHp < 0.4 && this.state.healingOrbs.length > 0 && this.druidOrbHealTimer <= 0) {
        this.state.healingOrbs.shift(); p.hp = Math.min(p.maxHp, p.hp + 14); this.druidOrbHealTimer = 0.65;
      }
    } else { this.druidRegenTimer = 0; this.druidOrbHealTimer = 0; }
    if (p.hp <= 0) { p.hp = 0; this.state.dead = true; }
  }

  private spawnWave() {
    const count = CONFIG.waves.firstCount + (this.state.wave - 1) * CONFIG.waves.addedPerWave;
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(Math.random() * 4), offset = 90 + Math.random() * (this.world - 180);
      let x = offset, y = offset;
      if (edge === 0) { x = CONFIG.map.wall + 24; y = offset; }
      if (edge === 1) { x = this.world - CONFIG.map.wall - 24; y = offset; }
      if (edge === 2) { x = offset; y = CONFIG.map.wall + 24; }
      if (edge === 3) { x = offset; y = this.world - CONFIG.map.wall - 24; }
      if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < 320) { x = this.clamp(x + 420, 80, this.world - 80); }
      this.state.enemies.push({ id: this.nextId++, x, y, hp: CONFIG.enemy.health + (this.state.wave - 1) * 2, hitWait: 0, wobble: Math.random() * 8 });
    }
  }

  private moveEnemies(dt: number) {
    const p = this.state.player;
    for (const e of this.state.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
      e.x += dx / dist * CONFIG.enemy.speed * dt; e.y += dy / dist * CONFIG.enemy.speed * dt;
      e.hitWait -= dt;
      if (dist < CONFIG.player.radius + CONFIG.enemy.radius && e.hitWait <= 0) {
        e.hitWait = CONFIG.enemy.contactCooldown;
        if (Math.random() > CONFIG.player.dodge + this.levelStats.dodge) {
          p.hp -= Math.max(1, CONFIG.enemy.contactDamage - CONFIG.player.armor - this.levelStats.armor);
        }
      }
    }
  }

  private autoAttack() {
    const weapon = CONFIG.weapons[this.state.weapon];
    const speedBonus = this.levelStats.attackSpeed;
    if (this.attackTimer < 1 / (weapon.attackSpeed * (1 + speedBonus))) return;
    const p = this.state.player;
    const target = this.state.enemies.map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).filter(v => v.d <= weapon.range).sort((a, b) => a.d - b.d)[0];
    if (!target) return;
    this.attackTimer = 0;
    if (weapon.kind === 'melee') {
      target.e.hp -= weapon.damage;
      if (this.state.classId === 'druida') this.druidRegenTimer = 3;
      if (target.e.hp <= 0) this.killEnemy(target.e.id);
    } else {
      const dx = target.e.x - p.x, dy = target.e.y - p.y, dist = Math.hypot(dx, dy) || 1;
      this.state.shots.push({ id: this.nextId++, x: p.x, y: p.y, vx: dx / dist * weapon.projectileSpeed, vy: dy / dist * weapon.projectileSpeed, damage: weapon.damage, kind: weapon.kind, life: weapon.range / weapon.projectileSpeed + 0.2 });
    }
  }

  private moveShots(dt: number) {
    for (const shot of [...this.state.shots]) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      const target = this.state.enemies.find(e => Math.hypot(e.x - shot.x, e.y - shot.y) < CONFIG.enemy.radius + 6);
      if (target) {
        target.hp -= shot.damage; if (this.state.classId === 'druida') this.druidRegenTimer = 3;
        this.state.shots = this.state.shots.filter(s => s.id !== shot.id);
        if (target.hp <= 0) this.killEnemy(target.id);
      } else if (shot.life <= 0) this.state.shots = this.state.shots.filter(s => s.id !== shot.id);
    }
  }

  private killEnemy(id: number) {
    const e = this.state.enemies.find(v => v.id === id); if (!e) return;
    this.state.xpOrbs.push({ id: this.nextId++, x: e.x, y: e.y, value: CONFIG.xp.perSlime });
    if (this.state.classId === 'druida' && this.state.healingOrbs.length < 7) this.state.healingOrbs.push({ id: this.nextId++, value: 14 });
    this.state.enemies = this.state.enemies.filter(v => v.id !== id); this.state.kills += 1;
  }

  private collectXp() {
    const p = this.state.player;
    for (const orb of [...this.state.xpOrbs]) {
      if (Math.hypot(orb.x - p.x, orb.y - p.y) <= CONFIG.player.pickupRadius) {
        this.state.xpOrbs = this.state.xpOrbs.filter(o => o.id !== orb.id); p.xp += orb.value;
      }
    }
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp; p.level += 1; p.nextXp = CONFIG.xp.levelBase + p.level * CONFIG.xp.levelGrowth;
      p.maxHp += LEVEL_GROWTH.health; p.hp = Math.min(p.maxHp, p.hp + LEVEL_GROWTH.health);
      this.levelStats.armor += LEVEL_GROWTH.armor; this.levelStats.speed += LEVEL_GROWTH.speed;
      this.levelStats.attackSpeed += LEVEL_GROWTH.attackSpeed; this.levelStats.dodge += LEVEL_GROWTH.dodge;
    }
  }
  private clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
}