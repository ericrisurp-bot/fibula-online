import { CONFIG, LEVEL_GROWTH, type ClassId, type WeaponId } from './config';

type Vec = { x: number; y: number };
type Enemy = Vec & { id: number; hp: number; hitWait: number; wobble: number };
type Tree = Vec & { id: number; hits: number; size: 'small' | 'medium' | 'large' };
type WoodDrop = Vec & { id: number; amount: number };
type Orb = Vec & { id: number; value: number };
type HealingOrb = { id: number; value: number };
type Shot = Vec & { id: number; vx: number; vy: number; damage: number; kind: 'orb' | 'arrow'; life: number };
type FloatingDamage = Vec & { id: number; amount: number; color: '#ff4545' | '#ffffff'; age: number; duration: number };
type DyingEnemy = Enemy & { deathAge: number };
export type GameSnapshot = {
  player: Vec & { hp: number; maxHp: number; level: number; xp: number; nextXp: number; moving: boolean; facingX: number; facingY: number };
  enemies: Enemy[]; trees: Tree[]; woodDrops: WoodDrop[]; wood: number; xpOrbs: Orb[]; healingOrbs: HealingOrb[]; shots: Shot[]; floatingDamage: FloatingDamage[]; dyingEnemies: DyingEnemy[]; wave: number; elapsed: number;
  weapon: WeaponId; classId: ClassId; swordSwingAngle: number; swordSwingTimer: number; treeChopAngle: number; treeChopTimer: number; showRange: boolean; cameraFull: boolean; dead: boolean; kills: number;
};
type InputState = { x: number; y: number };

export class GameEngine {
  readonly world = CONFIG.map.size;
  state: GameSnapshot;
  private keys = new Set<string>();
  private input: InputState = { x: 0, y: 0 };
  private nextId = 1;
  private hordeCycle = 0;
  private hordeTarget = 0;
  private hordeSpawned = 0;
  private treeSpawnCountdown = 0;
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
    this.startHorde(); // A primeira horda começa em t=0.
    this.spawnInitialTrees();
    this.treeSpawnCountdown = this.treeSpawnDuration();
  }

  private freshState(): GameSnapshot {
    return {
      player: { x: this.world / 2, y: this.world / 2, hp: CONFIG.player.maxHealth, maxHp: CONFIG.player.maxHealth, level: 0, xp: 0, nextXp: CONFIG.xp.levelBase, moving: false, facingX: 0, facingY: 1 },
      enemies: [], trees: [], woodDrops: [], wood: 0, xpOrbs: [], healingOrbs: [], shots: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0,
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
  setMove(x: number, y: number) {
    if (this.state.dead) return;
    this.input = { x, y };
    const magnitude = Math.hypot(x, y);
    if (magnitude > 0.12) {
      this.state.player.facingX = x / magnitude;
      this.state.player.facingY = y / magnitude;
    }
  }
  setClass(classId: ClassId) {
    if (this.state.dead) return;
    const changed = this.state.classId !== classId;
    this.state.classId = classId;

    // A classe selecionada define a arma; não existe troca independente de arma.
    const classWeapon: Record<ClassId, WeaponId> = {
      guerreiro: 'espada',
      mago: 'cajado',
      arqueiro: 'arco',
      druida: 'bastao',
    };
    this.state.weapon = classWeapon[classId];

    // Habilidades exclusivas do Druida nunca sobrevivem ao sair da classe.
    if (classId !== 'druida') {
      this.druidRegenTimer = 0;
      this.druidOrbHealTimer = 0;
      this.state.healingOrbs = [];
    } else if (changed) {
      this.druidRegenTimer = 0;
      this.druidOrbHealTimer = 0;
    }

    // Publica classe, arma e habilidades juntas como um único estado coerente.
    this.emit();
  }
  toggleCamera() { if (this.state.dead) return; this.state.cameraFull = !this.state.cameraFull; this.emit(); }
  toggleRange() { if (this.state.dead) return; this.state.showRange = !this.state.showRange; this.emit(); }
  restart() {
    this.stop(); this.state = this.freshState(); this.nextId = 1; this.hordeCycle = 0; this.hordeTarget = 0; this.hordeSpawned = 0; this.treeSpawnCountdown = 0; this.attackTimer = 0;
    this.elapsed = 0; this.levelStats = { speed: 0, armor: 0, dodge: 0, attackSpeed: 0 };
    this.enemyDamageTimer = 0; this.druidRegenTimer = 0; this.druidOrbHealTimer = 0; this.keys.clear(); this.input = { x: 0, y: 0 }; this.startHorde(); this.spawnInitialTrees(); this.treeSpawnCountdown = this.treeSpawnDuration(); this.start(); this.emit();
  }
  private emit() { this.onUpdate({ ...this.state, player: { ...this.state.player }, enemies: [...this.state.enemies], trees: [...this.state.trees], woodDrops: [...this.state.woodDrops], xpOrbs: [...this.state.xpOrbs], healingOrbs: [...this.state.healingOrbs], shots: [...this.state.shots], floatingDamage: [...this.state.floatingDamage], dyingEnemies: [...this.state.dyingEnemies] }); }

  // Só valores apresentados na interface participam da comparação; posições e animações ficam no Canvas.
  private visibleStateKey() {
    const s = this.state;
    return [
      Math.floor(s.elapsed), s.player.hp, s.player.maxHp, s.player.level,
      s.player.xp, s.player.nextXp, s.wave, s.wood, s.trees.length, s.woodDrops.length, s.weapon, s.classId, s.healingOrbs.length, s.showRange,
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
    this.state.floatingDamage = this.state.floatingDamage.map(text => ({ ...text, age: text.age + dt })).filter(text => text.age < text.duration);
    this.state.dyingEnemies = this.state.dyingEnemies.map(enemy => ({ ...enemy, deathAge: enemy.deathAge + dt })).filter(enemy => enemy.deathAge < 0.48);
    this.attackTimer += dt; this.enemyDamageTimer -= dt;
    const p = this.state.player;
    let dx = this.input.x, dy = this.input.y;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    this.state.player.moving = mag > 0.08;
    if (this.state.player.moving) {
      const directionLength = Math.hypot(dx, dy) || 1;
      this.state.player.facingX = dx / directionLength;
      this.state.player.facingY = dy / directionLength;
    }
    const speed = CONFIG.player.speed + this.levelStats.speed;
    p.x = this.clamp(p.x + dx * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);
    p.y = this.clamp(p.y + dy * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);

    const cycle = Math.floor(this.elapsed / CONFIG.waves.cycle);
    if (cycle > this.hordeCycle) {
      this.hordeCycle = cycle;
      this.state.wave = cycle + 1;
      this.startHorde();
    }
    const cycleElapsed = this.elapsed % CONFIG.waves.cycle;
    if (cycleElapsed < CONFIG.waves.hordaDuration) {
      const targetSpawned = Math.min(this.hordeTarget, Math.floor(cycleElapsed / (CONFIG.waves.hordaDuration / this.hordeTarget)) + 1);
      while (this.hordeSpawned < targetSpawned) this.spawnHordeEnemy();
    }
    this.updateTreeSpawner(dt); this.moveEnemies(dt); this.moveShots(dt); this.state.swordSwingTimer = Math.max(0, this.state.swordSwingTimer - dt); this.state.treeChopTimer = Math.max(0, this.state.treeChopTimer - dt); this.autoAttack(); this.collectXp(dt); this.collectWood();
    if (this.state.classId === 'druida') {
      this.druidRegenTimer = Math.max(0, this.druidRegenTimer - dt);
      if (this.druidRegenTimer > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 1.2 * dt);
      this.druidOrbHealTimer -= dt;
      if (p.hp > 0 && p.hp / p.maxHp < 0.4 && this.state.healingOrbs.length > 0 && this.druidOrbHealTimer <= 0) {
        this.state.healingOrbs.shift(); p.hp = Math.min(p.maxHp, p.hp + 14); this.druidOrbHealTimer = 0.65;
      }
    } else {
      // Invariante: nenhuma habilidade/órbe do Druida pode sobreviver fora dessa classe.
      this.druidRegenTimer = 0;
      this.druidOrbHealTimer = 0;
      if (this.state.healingOrbs.length > 0) this.state.healingOrbs = [];
    }
    if (p.hp <= 0) { p.hp = 0; this.state.dead = true; }
  }

  private treeSpawnDuration() {
    return Math.max(CONFIG.trees.spawnMin, CONFIG.trees.spawnBase - CONFIG.trees.spawnReductionPerTree * this.state.trees.length);
  }

  private spawnInitialTrees() {
    for (let i = 0; i < CONFIG.trees.startCount; i++) this.spawnTree(true);
  }

  private updateTreeSpawner(dt: number) {
    this.treeSpawnCountdown -= dt;
    if (this.treeSpawnCountdown > 0) return;
    if (this.state.trees.length < CONFIG.trees.max) this.spawnTree();
    this.treeSpawnCountdown = this.treeSpawnDuration();
  }

  private validTreePosition(x: number, y: number, minSpacing = 0) {
    const margin = CONFIG.map.wall + 80;
    if (x < margin || y < margin || x > this.world - margin || y > this.world - margin) return false;
    if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.trees.noSpawnRadius) return false;
    return this.state.trees.every(tree => Math.hypot(x - tree.x, y - tree.y) >= minSpacing);
  }

  private spawnTree(initial = false) {
    if (this.state.trees.length >= CONFIG.trees.max) return false;
    const margin = CONFIG.map.wall + 80;
    let position: Vec | null = null;
    if (!initial && this.state.trees.length > 0 && Math.random() < 0.7) {
      for (let attempt = 0; attempt < 80 && !position; attempt++) {
        const anchor = this.state.trees[Math.floor(Math.random() * this.state.trees.length)];
        const angle = Math.random() * Math.PI * 2;
        const distance = 150 + Math.random() * 100;
        const x = anchor.x + Math.cos(angle) * distance;
        const y = anchor.y + Math.sin(angle) * distance;
        if (this.validTreePosition(x, y)) position = { x, y };
      }
    }
    for (let attempt = 0; attempt < 400 && !position; attempt++) {
      const x = margin + Math.random() * (this.world - margin * 2);
      const y = margin + Math.random() * (this.world - margin * 2);
      if (this.validTreePosition(x, y, initial ? 300 : 0)) position = { x, y };
    }
    if (!position) return false;
    const roll = Math.random();
    const size: Tree['size'] = roll < CONFIG.trees.sizeWeights.small ? 'small' : roll < CONFIG.trees.sizeWeights.small + CONFIG.trees.sizeWeights.medium ? 'medium' : 'large';
    this.state.trees.push({ id: this.nextId++, x: position.x, y: position.y, hits: CONFIG.trees.hitsToCut, size });
    return true;
  }

  private cutTree(id: number) {
    const tree = this.state.trees.find(value => value.id === id);
    if (!tree) return;
    this.state.trees = this.state.trees.filter(value => value.id !== id);
    const roll = Math.random();
    const amount = tree.size === 'small' ? 1 : tree.size === 'medium' ? (roll < 0.5 ? 1 : 2) : (roll < 0.2 ? 1 : roll < 0.5 ? 2 : 3);
    this.state.woodDrops.push({ id: this.nextId++, x: tree.x, y: tree.y, amount });
  }

  private collectWood() {
    if (this.state.wood >= CONFIG.trees.carryLimit) return;
    for (const drop of [...this.state.woodDrops]) {
      if (this.state.wood >= CONFIG.trees.carryLimit) break;
      if (Math.hypot(drop.x - this.state.player.x, drop.y - this.state.player.y) > CONFIG.player.radius + 10) continue;
      const collected = Math.min(drop.amount, CONFIG.trees.carryLimit - this.state.wood);
      this.state.wood += collected;
      if (collected >= drop.amount) this.state.woodDrops = this.state.woodDrops.filter(value => value.id !== drop.id);
      else drop.amount -= collected;
    }
  }

  private startHorde() {
    let count = CONFIG.waves.firstCount;
    for (let wave = 2; wave <= this.state.wave; wave++) {
      count += CONFIG.waves.addedPerWave + Math.floor((wave - 1) / CONFIG.waves.increaseEveryWaves) * CONFIG.waves.addedIncrease;
    }
    this.hordeTarget = count;
    this.hordeSpawned = 0;
    this.spawnHordeEnemy();
  }

  private spawnHordeEnemy() {
    if (this.hordeSpawned >= this.hordeTarget) return;
    this.hordeSpawned += 1;
    if (this.state.enemies.length >= CONFIG.waves.maxAlive) return;
    const edge = Math.floor(Math.random() * 4), offset = 90 + Math.random() * (this.world - 180);
    let x = offset, y = offset;
    if (edge === 0) { x = CONFIG.map.wall + 24; y = offset; }
    if (edge === 1) { x = this.world - CONFIG.map.wall - 24; y = offset; }
    if (edge === 2) { x = offset; y = CONFIG.map.wall + 24; }
    if (edge === 3) { x = offset; y = this.world - CONFIG.map.wall - 24; }
    if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < 320) { x = this.clamp(x + 420, 80, this.world - 80); }
    this.state.enemies.push({ id: this.nextId++, x, y, hp: CONFIG.enemy.health + (this.state.wave - 1) * CONFIG.enemy.healthPerWave, hitWait: 0, wobble: Math.random() * 8 });
  }

  private moveEnemies(dt: number) {
    const p = this.state.player;
    for (const e of this.state.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
      const speed = CONFIG.enemy.speed + Math.floor((this.state.wave - 1) / CONFIG.enemy.speedEveryWaves) * CONFIG.enemy.speedIncrease;
      e.x += dx / dist * speed * dt; e.y += dy / dist * speed * dt;
      e.hitWait -= dt;
      if (dist < CONFIG.player.radius + CONFIG.enemy.radius && e.hitWait <= 0) {
        e.hitWait = CONFIG.enemy.contactCooldown;
        if (Math.random() > CONFIG.player.dodge + this.levelStats.dodge) {
          const waveDamage = CONFIG.enemy.contactDamage + Math.floor((this.state.wave - 1) / CONFIG.enemy.contactDamageEveryWaves) * CONFIG.enemy.contactDamageIncrease;
          const damage = Math.max(1, waveDamage - CONFIG.player.armor - this.levelStats.armor);
          p.hp -= damage;
          this.addFloatingDamage(p.x, p.y - CONFIG.player.radius * 1.8, damage, '#ff4545');
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
    if (!target) {
      const treeTarget = this.state.trees.map(tree => ({ tree, d: Math.hypot(tree.x - p.x, tree.y - p.y) })).filter(v => v.d <= CONFIG.trees.cutRange).sort((a, b) => a.d - b.d)[0];
      if (!treeTarget) return;
      this.attackTimer = 0;
      this.state.treeChopAngle = Math.atan2(treeTarget.tree.y - p.y, treeTarget.tree.x - p.x);
      this.state.treeChopTimer = 0.2;
      treeTarget.tree.hits -= 1;
      if (treeTarget.tree.hits <= 0) this.cutTree(treeTarget.tree.id);
      return;
    }
    this.attackTimer = 0;
    if (weapon.kind === 'melee') {
      this.state.swordSwingAngle = Math.atan2(target.e.y - p.y, target.e.x - p.x);
      this.state.swordSwingTimer = 0.24;
      const arc = Math.PI * 0.62;
      const hits = this.state.enemies.filter(e => {
        const ex = e.x - p.x, ey = e.y - p.y;
        const distance = Math.hypot(ex, ey);
        const angle = Math.atan2(ey, ex);
        const difference = Math.abs(Math.atan2(Math.sin(angle - this.state.swordSwingAngle), Math.cos(angle - this.state.swordSwingAngle)));
        return distance <= weapon.range && difference <= arc / 2;
      });
      for (const enemy of hits) {
        const damage = weapon.damage + this.state.player.level * 0.3;
        enemy.hp -= damage;
        this.addFloatingDamage(enemy.x, enemy.y - CONFIG.enemy.radius * 1.7, damage, '#ffffff');
        if (this.state.classId === 'druida') this.druidRegenTimer = 3;
      }
      for (const enemy of hits.filter(e => e.hp <= 0)) this.killEnemy(enemy.id);
    } else {
      const dx = target.e.x - p.x, dy = target.e.y - p.y, dist = Math.hypot(dx, dy) || 1;
      this.state.shots.push({ id: this.nextId++, x: p.x, y: p.y, vx: dx / dist * weapon.projectileSpeed, vy: dy / dist * weapon.projectileSpeed, damage: weapon.damage + this.state.player.level * 0.3, kind: weapon.kind, life: weapon.range / weapon.projectileSpeed + 0.2 });
    }
  }

  private moveShots(dt: number) {
    for (const shot of [...this.state.shots]) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      const target = this.state.enemies.find(e => Math.hypot(e.x - shot.x, e.y - shot.y) < CONFIG.enemy.radius + 6);
      if (target) {
        target.hp -= shot.damage;
        this.addFloatingDamage(target.x, target.y - CONFIG.enemy.radius * 1.7, shot.damage, '#ffffff');
        if (this.state.classId === 'druida') this.druidRegenTimer = 3;
        this.state.shots = this.state.shots.filter(s => s.id !== shot.id);
        if (target.hp <= 0) this.killEnemy(target.id);
      } else if (shot.life <= 0) this.state.shots = this.state.shots.filter(s => s.id !== shot.id);
    }
  }

  private killEnemy(id: number) {
    const e = this.state.enemies.find(v => v.id === id); if (!e) return;
    this.state.dyingEnemies.push({ ...e, deathAge: 0 });
    this.state.xpOrbs.push({ id: this.nextId++, x: e.x, y: e.y, value: CONFIG.xp.perSlime });
    if (this.state.classId === 'druida' && this.state.healingOrbs.length < 7) this.state.healingOrbs.push({ id: this.nextId++, value: 14 });
    this.state.enemies = this.state.enemies.filter(v => v.id !== id); this.state.kills += 1;
  }

  private addFloatingDamage(x: number, y: number, amount: number, color: FloatingDamage['color']) {
    this.state.floatingDamage.push({ id: this.nextId++, x, y, amount, color, age: 0, duration: 0.72 });
  }

  private collectXp(dt: number) {
    const p = this.state.player;
    for (const orb of [...this.state.xpOrbs]) {
      const dx = p.x - orb.x, dy = p.y - orb.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance <= CONFIG.player.pickupRadius) {
        this.state.xpOrbs = this.state.xpOrbs.filter(o => o.id !== orb.id); p.xp += orb.value;
      } else if (distance <= CONFIG.xp.attractionRadius) {
        const step = Math.min(distance - CONFIG.player.pickupRadius, CONFIG.xp.attractionSpeed * dt);
        orb.x += dx / distance * step;
        orb.y += dy / distance * step;
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