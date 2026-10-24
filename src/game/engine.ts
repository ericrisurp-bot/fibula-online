import { CONFIG, type ClassId, type WeaponId } from './config';
import { getAttributeEffectPerLevel } from './attributes';
import { addToInventory, type InventoryStack } from './inventory';

type Vec = { x: number; y: number };
const XP_ATTRACTION_RADIUS = 250;
type Enemy = Vec & { id: number; hp: number; hitWait: number; wobble: number };
type Tree = Vec & { id: number; hits: number; size: 'small' | 'medium' | 'large' };
type Rock = Vec & { id: number; hits: number; size: 'small' | 'medium' | 'large'; clusterId: number };
type WoodDrop = Vec & { id: number; amount: number };
type StoneDrop = Vec & { id: number };
type BronzeDrop = Vec & { id: number };
type Orb = Vec & { id: number; value: number };
type HealingOrb = { id: number; value: number };
type Shot = Vec & { id: number; vx: number; vy: number; damage: number; kind: 'orb' | 'arrow'; life: number; explosive?: boolean };
type ExplosionEffect = Vec & { id: number; age: number; duration: number };
type FloatingDamage = Vec & { id: number; amount: number; color: '#ff4545' | '#ffffff'; age: number; duration: number };
type DyingEnemy = Enemy & { deathAge: number };
type CartState = Vec & { angle: number; repairWood: number; repaired: boolean; carried: boolean; inventory: InventoryStack[] };
type RefineryState = Vec & { woodDelivered: number; stoneDelivered: number; built: boolean; stoneStock: number; stonesProcessed: number; bronzeProduced: number };
export type GameSnapshot = {
  player: Vec & { hp: number; maxHp: number; level: number; xp: number; nextXp: number; moving: boolean; facingX: number; facingY: number };
  house: Vec & { woodDelivered: number; built: boolean; inventory: InventoryStack[] };
  refinery: RefineryState;
  cart: CartState;
  enemies: Enemy[]; trees: Tree[]; rocks: Rock[]; woodDrops: WoodDrop[]; stoneDrops: StoneDrop[]; bronzeDrops: BronzeDrop[]; inventory: InventoryStack[]; xpOrbs: Orb[]; healingOrbs: HealingOrb[]; shots: Shot[]; explosions: ExplosionEffect[]; floatingDamage: FloatingDamage[]; dyingEnemies: DyingEnemy[]; wave: number; elapsed: number; dayNight: 'day' | 'night'; phaseElapsed: number; nightNumber: number; startedAtNight: boolean;
  weapon: WeaponId; classId: ClassId; swordSwingAngle: number; swordSwingTimer: number; treeChopAngle: number; treeChopTimer: number; rockMineAngle: number; rockMineTimer: number; showRange: boolean; cameraFull: boolean; dead: boolean; kills: number;
};
type InputState = { x: number; y: number };

export class GameEngine {
  readonly world = CONFIG.map.size;
  state: GameSnapshot;
  private keys = new Set<string>();
  private input: InputState = { x: 0, y: 0 };
  private nextId = 1;
  private hordeTarget = 0;
  private hordeSpawned = 0;
  private hordeScheduled = 0;
  private startAtNight = false;
  private wasNight = false;
  private nightNumber = 0;
  private treeSpawnCountdown = 0;
  private rockSpawnCountdown = 0;
  private nextRockClusterId = 1;
  private attackTimer = 0;
  private mageAttackCount = 0;
  private elapsed = 0;
  private lastTime = 0;
  private animation = 0;
  private levelStats = { speed: 0, armor: 0, dodge: 0, attackSpeed: 0 };
  private enemyDamageTimer = 0;
  private druidRegenTimer = 0;
  private druidOrbHealTimer = 0;
  private refineryProcessTimer = 0;

  constructor(private onUpdate: (state: GameSnapshot) => void) {
    this.state = this.freshState();
    this.initializeDayNight();
    this.placeHouse();
    this.placeCart();
    this.placeRefinery();
    this.spawnInitialTrees();
    this.treeSpawnCountdown = this.treeSpawnDuration();
    this.spawnInitialRocks();
    this.rockSpawnCountdown = this.rockSpawnDuration();
  }

  private freshState(): GameSnapshot {
    return {
      player: { x: this.world / 2, y: this.world / 2, hp: CONFIG.player.maxHealth, maxHp: CONFIG.player.maxHealth, level: 0, xp: 0, nextXp: CONFIG.xp.levelBase, moving: false, facingX: 0, facingY: 1 },
      house: { x: this.world / 4, y: this.world / 4, woodDelivered: 0, built: false, inventory: [] },
      refinery: { x: this.world * 0.7, y: this.world * 0.7, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 },
      cart: { x: this.world * 0.75, y: this.world * 0.25, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] },
      enemies: [], trees: [], rocks: [], woodDrops: [], stoneDrops: [], bronzeDrops: [], inventory: [], xpOrbs: [], healingOrbs: [], shots: [], explosions: [], floatingDamage: [], dyingEnemies: [], wave: 1, elapsed: 0, dayNight: 'day', phaseElapsed: 0, nightNumber: 0, startedAtNight: false, weapon: 'espada', classId: 'guerreiro', swordSwingAngle: 0, swordSwingTimer: 0, treeChopAngle: 0, treeChopTimer: 0, rockMineAngle: 0, rockMineTimer: 0,
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
    if (changed) this.mageAttackCount = 0;
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
  private deliverWoodToHouseUnderConstruction() {
    const house = this.state.house;
    if (house.built) return;

    const playerNearHouse = Math.hypot(this.state.player.x - house.x, this.state.player.y - house.y) <= CONFIG.house.interactRadius;
    const cartNearHouse = Math.hypot(this.state.cart.x - house.x, this.state.cart.y - house.y) <= CONFIG.house.interactRadius;
    const cartCanDeliver = this.state.cart.carried ? playerNearHouse : cartNearHouse;
    if (!playerNearHouse && !cartNearHouse) return;

    const consumeWood = (inventory: InventoryStack[], requested: number) => {
      let toRemove = requested;
      let consumed = 0;
      const nextInventory = inventory.flatMap(stack => {
        if (stack.itemId !== 'wood' || toRemove <= 0) return [stack];
        const used = Math.min(stack.quantity, toRemove);
        toRemove -= used;
        consumed += used;
        const left = stack.quantity - used;
        return left > 0 ? [{ ...stack, quantity: left }] : [];
      });
      return { inventory: nextInventory, consumed };
    };

    let remaining = CONFIG.house.buildCost - house.woodDelivered;
    if (remaining <= 0) return;

    if (playerNearHouse) {
      const result = consumeWood(this.state.inventory, remaining);
      this.state.inventory = result.inventory;
      house.woodDelivered += result.consumed;
      remaining -= result.consumed;
    }

    if (cartCanDeliver && remaining > 0) {
      const result = consumeWood(this.state.cart.inventory, remaining);
      this.state.cart.inventory = result.inventory;
      house.woodDelivered += result.consumed;
    }

    if (house.woodDelivered >= CONFIG.house.buildCost) {
      house.woodDelivered = CONFIG.house.buildCost;
      house.built = true;
    }
  }
  private deliverMaterialsToRefinery() {
    const refinery = this.state.refinery;
    if (refinery.built) return;
    const playerNear = Math.hypot(this.state.player.x - refinery.x, this.state.player.y - refinery.y) <= CONFIG.refinery.interactRadius;
    const cartNear = Math.hypot(this.state.cart.x - refinery.x, this.state.cart.y - refinery.y) <= CONFIG.refinery.interactRadius;
    const cartCanDeliver = this.state.cart.carried ? playerNear : cartNear;
    if (!playerNear && !cartNear) return;
    const consume = (inventory: InventoryStack[], itemId: string, requested: number) => {
      let toRemove = requested, consumed = 0;
      const nextInventory = inventory.flatMap(stack => {
        if (stack.itemId !== itemId || toRemove <= 0) return [stack];
        const used = Math.min(stack.quantity, toRemove);
        toRemove -= used; consumed += used;
        const left = stack.quantity - used;
        return left > 0 ? [{ ...stack, quantity: left }] : [];
      });
      return { inventory: nextInventory, consumed };
    };
    if (playerNear) {
      const woodLeft = CONFIG.refinery.buildCostWood - refinery.woodDelivered;
      const stoneLeft = CONFIG.refinery.buildCostStone - refinery.stoneDelivered;
      if (woodLeft > 0) {
        const result = consume(this.state.inventory, 'wood', woodLeft);
        this.state.inventory = result.inventory; refinery.woodDelivered += result.consumed;
      }
      if (stoneLeft > 0) {
        const result = consume(this.state.inventory, 'stone', stoneLeft);
        this.state.inventory = result.inventory; refinery.stoneDelivered += result.consumed;
      }
    }
    if (cartCanDeliver) {
      const woodLeft = CONFIG.refinery.buildCostWood - refinery.woodDelivered;
      const stoneLeft = CONFIG.refinery.buildCostStone - refinery.stoneDelivered;
      if (woodLeft > 0) {
        const result = consume(this.state.cart.inventory, 'wood', woodLeft);
        this.state.cart.inventory = result.inventory; refinery.woodDelivered += result.consumed;
      }
      if (stoneLeft > 0) {
        const result = consume(this.state.cart.inventory, 'stone', stoneLeft);
        this.state.cart.inventory = result.inventory; refinery.stoneDelivered += result.consumed;
      }
    }
    if (refinery.woodDelivered >= CONFIG.refinery.buildCostWood && refinery.stoneDelivered >= CONFIG.refinery.buildCostStone) {
      refinery.woodDelivered = CONFIG.refinery.buildCostWood;
      refinery.stoneDelivered = CONFIG.refinery.buildCostStone;
      refinery.built = true;
    }
  }

  private deliverStonesToRefinery() {
    const refinery = this.state.refinery;
    if (!refinery.built || refinery.stoneStock >= CONFIG.refinery.stoneCapacity) return;
    const playerNear = Math.hypot(this.state.player.x - refinery.x, this.state.player.y - refinery.y) <= CONFIG.refinery.interactRadius;
    const cartNear = Math.hypot(this.state.cart.x - refinery.x, this.state.cart.y - refinery.y) <= CONFIG.refinery.interactRadius;
    const cartCanDeliver = this.state.cart.carried ? playerNear : cartNear;
    const transferStones = (inventory: InventoryStack[]) => {
      const room = CONFIG.refinery.stoneCapacity - refinery.stoneStock;
      let toRemove = room;
      let transferred = 0;
      const nextInventory = inventory.flatMap(stack => {
        if (stack.itemId !== 'stone' || toRemove <= 0) return [stack];
        const used = Math.min(stack.quantity, toRemove);
        toRemove -= used;
        transferred += used;
        const left = stack.quantity - used;
        return left > 0 ? [{ ...stack, quantity: left }] : [];
      });
      refinery.stoneStock += transferred;
      return nextInventory;
    };
    if (playerNear && refinery.stoneStock < CONFIG.refinery.stoneCapacity) this.state.inventory = transferStones(this.state.inventory);
    if (cartCanDeliver && refinery.stoneStock < CONFIG.refinery.stoneCapacity) this.state.cart.inventory = transferStones(this.state.cart.inventory);
  }

  private processRefinery(dt: number) {
    const refinery = this.state.refinery;
    if (!refinery.built || refinery.stoneStock <= 0) {
      this.refineryProcessTimer = 0;
      return;
    }

    this.refineryProcessTimer += dt;
    if (this.refineryProcessTimer < CONFIG.refinery.processInterval) return;
    this.refineryProcessTimer -= CONFIG.refinery.processInterval;
    refinery.stoneStock -= 1;
    refinery.stonesProcessed += 1;
    if (Math.random() < CONFIG.refinery.bronzeChance) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 42 + Math.random() * 12;
      this.state.bronzeDrops.push({ id: this.nextId++, x: refinery.x + Math.cos(angle) * distance, y: refinery.y + Math.sin(angle) * distance });
      refinery.bronzeProduced += 1;
    }
    if (refinery.stoneStock <= 0) this.refineryProcessTimer = 0;
  }

  private collectBronze() {
    for (const drop of [...this.state.bronzeDrops]) {
      if (Math.hypot(drop.x - this.state.player.x, drop.y - this.state.player.y) > CONFIG.player.radius + 10) continue;
      const result = addToInventory(this.state.inventory, 'bronze', 1, CONFIG.inventory);
      if (result.added === 0) continue;
      this.state.inventory = result.inventory;
      this.state.bronzeDrops = this.state.bronzeDrops.filter(value => value.id !== drop.id);
    }
  }

  private autoStoreItemsAtHouse() {
    const house = this.state.house;
    if (!house.built) return;
    const playerNearHouse = Math.hypot(this.state.player.x - house.x, this.state.player.y - house.y) <= CONFIG.house.interactRadius;
    const cartNearHouse = Math.hypot(this.state.cart.x - house.x, this.state.cart.y - house.y) <= CONFIG.house.interactRadius;
    if (!playerNearHouse) return;
    const store = (items: InventoryStack[]) => {
      for (const stack of items) {
        const existing = house.inventory.find(item => item.itemId === stack.itemId);
        if (existing) existing.quantity += stack.quantity;
        else house.inventory.push({ ...stack });
      }
    };
    store(this.state.inventory);
    this.state.inventory = [];
    if (this.state.cart.carried || cartNearHouse) {
      store(this.state.cart.inventory);
      this.state.cart.inventory = [];
    }
  }
  toggleCart() {
    if (this.state.dead || !this.state.cart.repaired) return;
    const cart = this.state.cart;
    if (cart.carried) {
      cart.carried = false;
      cart.x = this.clamp(this.state.player.x - this.state.player.facingX * CONFIG.cart.followDistance, CONFIG.map.wall + CONFIG.cart.wallMargin, this.world - CONFIG.map.wall - CONFIG.cart.wallMargin);
      cart.y = this.clamp(this.state.player.y - this.state.player.facingY * CONFIG.cart.followDistance, CONFIG.map.wall + CONFIG.cart.wallMargin, this.world - CONFIG.map.wall - CONFIG.cart.wallMargin);
      this.resolveObstacleCollisions(cart, 30, true);
    } else if (Math.hypot(this.state.player.x - cart.x, this.state.player.y - cart.y) <= CONFIG.cart.interactRadius) {
      cart.carried = true;
      cart.angle = this.state.player.facingX < -0.15 ? Math.PI : 0;
      this.updateCart(0);
      this.autoLoadCartFromInventory();
    } else return;
    this.emit();
  }
  private autoLoadCartFromInventory() {
    const cart = this.state.cart;
    if (!cart.carried || this.state.inventory.length === 0) return;
    let cartInventory = cart.inventory;
    const remainingInventory: InventoryStack[] = [];
    for (const stack of this.state.inventory) {
      const result = addToInventory(cartInventory, stack.itemId, stack.quantity, {
        maxSlots: CONFIG.cart.capacitySlots,
        maxPerSlot: CONFIG.cart.maxPerSlot,
      });
      cartInventory = result.inventory;
      const remaining = stack.quantity - result.added;
      if (remaining > 0) remainingInventory.push({ ...stack, quantity: remaining });
    }
    cart.inventory = cartInventory;
    this.state.inventory = remainingInventory;
  }
  discardBagItem(index: number) {
    if (this.state.dead) return;
    if (!this.state.inventory[index]) return;
    this.state.inventory = this.state.inventory.filter((_, itemIndex) => itemIndex !== index);
    this.emit();
  }
  transferBagToCart(index: number) {
    if (!this.isCartAccessible()) return;
    const stack = this.state.inventory[index];
    if (!stack) return;
    const result = addToInventory(this.state.cart.inventory, stack.itemId, stack.quantity, { maxSlots: CONFIG.cart.capacitySlots, maxPerSlot: CONFIG.cart.maxPerSlot });
    if (result.added <= 0) return;
    this.state.cart.inventory = result.inventory;
    const remaining = stack.quantity - result.added;
    this.state.inventory = this.state.inventory.flatMap((item, itemIndex) => itemIndex !== index ? [item] : remaining > 0 ? [{ ...item, quantity: remaining }] : []);
    this.emit();
  }
  transferCartToBag(index: number) {
    if (!this.isCartAccessible()) return;
    const stack = this.state.cart.inventory[index];
    if (!stack) return;
    const result = addToInventory(this.state.inventory, stack.itemId, stack.quantity, CONFIG.inventory);
    if (result.added <= 0) return;
    this.state.inventory = result.inventory;
    const remaining = stack.quantity - result.added;
    this.state.cart.inventory = this.state.cart.inventory.flatMap((item, itemIndex) => itemIndex !== index ? [item] : remaining > 0 ? [{ ...item, quantity: remaining }] : []);
    this.emit();
  }
  isCartAccessible() {
    return this.state.cart.repaired && (this.state.cart.carried || Math.hypot(this.state.player.x - this.state.cart.x, this.state.player.y - this.state.cart.y) <= CONFIG.cart.interactRadius);
  }
  private repairCartWithWood() {
    const cart = this.state.cart;
    if (cart.repaired || Math.hypot(this.state.player.x - cart.x, this.state.player.y - cart.y) > CONFIG.cart.interactRadius) return;
    const remaining = CONFIG.cart.repairCost - cart.repairWood;
    const carriedWood = this.state.inventory.reduce((total, stack) => total + (stack.itemId === 'wood' ? stack.quantity : 0), 0);
    const amount = Math.min(remaining, carriedWood);
    if (amount <= 0) return;
    let toRemove = amount;
    this.state.inventory = this.state.inventory.flatMap(stack => {
      if (stack.itemId !== 'wood' || toRemove <= 0) return [stack];
      const used = Math.min(stack.quantity, toRemove);
      toRemove -= used;
      const left = stack.quantity - used;
      return left > 0 ? [{ ...stack, quantity: left }] : [];
    });
    cart.repairWood += amount;
    if (cart.repairWood >= CONFIG.cart.repairCost) {
      cart.repairWood = CONFIG.cart.repairCost;
      cart.repaired = true;
    }
  }
  private updateCart(dt: number) {
    const cart = this.state.cart;
    if (!cart.carried) return;
    const p = this.state.player;
    // O carrinho só espelha na horizontal; movimentos para cima/baixo mantêm o último lado.
    if (p.facingX < -0.15) cart.angle = Math.PI;
    else if (p.facingX > 0.15) cart.angle = 0;
    const margin = CONFIG.map.wall + CONFIG.cart.wallMargin;
    const targetX = this.clamp(p.x - p.facingX * CONFIG.cart.followDistance, margin, this.world - margin);
    const targetY = this.clamp(p.y - p.facingY * CONFIG.cart.followDistance, margin, this.world - margin);
    const dx = targetX - cart.x;
    const dy = targetY - cart.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, CONFIG.cart.followSpeed * dt);
    if (distance > 0) {
      cart.x = this.clamp(cart.x + dx / distance * step, margin, this.world - margin);
      cart.y = this.clamp(cart.y + dy / distance * step, margin, this.world - margin);
      this.resolveObstacleCollisions(cart, 30, true);
    }
  }
  private placeCart() {
    const margin = CONFIG.map.wall + CONFIG.cart.wallMargin;
    for (let attempt = 0; attempt < 1200; attempt++) {
      const x = margin + Math.random() * (this.world - margin * 2);
      const y = margin + Math.random() * (this.world - margin * 2);
      if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.house.playerClearRadius) continue;
      if (Math.hypot(x - this.state.house.x, y - this.state.house.y) < CONFIG.cart.minimumHouseDistance) continue;
      if (this.state.trees.some(tree => Math.hypot(x - this.treeBase(tree).x, y - this.treeBase(tree).y) < 38 + this.treeFootprintRadius(tree))) continue;
      this.state.cart = { x, y, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] };
      return;
    }
    this.state.cart = { x: this.world * 0.75, y: this.world * 0.25, angle: 0, repairWood: 0, repaired: false, carried: false, inventory: [] };
  }
  toggleCamera() { if (this.state.dead) return; this.state.cameraFull = !this.state.cameraFull; this.emit(); }
  toggleRange() { if (this.state.dead) return; this.state.showRange = !this.state.showRange; this.emit(); }
  restart() {
    this.stop(); this.state = this.freshState(); this.mageAttackCount = 0; this.nextId = 1; this.nextRockClusterId = 1; this.hordeTarget = 0; this.hordeSpawned = 0; this.hordeScheduled = 0; this.nightNumber = 0; this.wasNight = false; this.treeSpawnCountdown = 0; this.rockSpawnCountdown = 0; this.attackTimer = 0;
    this.elapsed = 0; this.refineryProcessTimer = 0; this.levelStats = { speed: 0, armor: 0, dodge: 0, attackSpeed: 0 };
    this.enemyDamageTimer = 0; this.druidRegenTimer = 0; this.druidOrbHealTimer = 0; this.keys.clear(); this.input = { x: 0, y: 0 }; this.initializeDayNight(); this.placeHouse(); this.placeCart(); this.placeRefinery(); this.spawnInitialTrees(); this.treeSpawnCountdown = this.treeSpawnDuration(); this.spawnInitialRocks(); this.rockSpawnCountdown = this.rockSpawnDuration(); this.start(); this.emit();
  }
  private emit() { this.onUpdate({ ...this.state, player: { ...this.state.player }, house: { ...this.state.house, inventory: this.state.house.inventory.map(stack => ({ ...stack })) }, refinery: { ...this.state.refinery }, cart: { ...this.state.cart, inventory: this.state.cart.inventory.map(stack => ({ ...stack })) }, enemies: [...this.state.enemies], trees: [...this.state.trees], rocks: [...this.state.rocks], woodDrops: [...this.state.woodDrops], stoneDrops: [...this.state.stoneDrops], bronzeDrops: [...this.state.bronzeDrops], inventory: this.state.inventory.map(stack => ({ ...stack })), xpOrbs: [...this.state.xpOrbs], healingOrbs: [...this.state.healingOrbs], shots: [...this.state.shots], explosions: [...this.state.explosions], floatingDamage: [...this.state.floatingDamage], dyingEnemies: [...this.state.dyingEnemies] }); }

  // Só valores apresentados na interface participam da comparação; posições e animações ficam no Canvas.
  private visibleStateKey() {
    const s = this.state;
    return [
      Math.floor(s.elapsed), s.player.hp, s.player.maxHp, s.player.level,
      s.player.xp, s.player.nextXp, s.wave, s.dayNight, s.nightNumber, s.inventory.map(stack => `${stack.itemId}:${stack.quantity}`).join(','), s.trees.length, s.rocks.length, s.woodDrops.length, s.stoneDrops.length, s.bronzeDrops.length, s.weapon, s.classId, s.healingOrbs.length, s.showRange,
      s.house.woodDelivered, s.house.built, s.house.inventory.map(stack => `${stack.itemId}:${stack.quantity}`).join(','), s.refinery.woodDelivered, s.refinery.stoneDelivered, s.refinery.built, s.refinery.stoneStock, s.refinery.stonesProcessed, s.refinery.bronzeProduced, s.bronzeDrops.length, s.cart.repairWood, s.cart.repaired, s.cart.carried, s.cart.inventory.map(stack => `${stack.itemId}:${stack.quantity}`).join(','), s.cameraFull, s.dead, s.kills,
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
    this.state.explosions = this.state.explosions.map(effect => ({ ...effect, age: effect.age + dt })).filter(effect => effect.age < effect.duration);
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
    const cartLoad = this.state.cart.inventory.reduce((total, stack) => total + stack.quantity, 0);
    const cartCapacity = CONFIG.cart.capacitySlots * CONFIG.cart.maxPerSlot;
    const loadFraction = Math.min(1, cartLoad / cartCapacity);
    const loadPenalty = CONFIG.cart.loadSlowdownMin + (CONFIG.cart.loadSlowdownMax - CONFIG.cart.loadSlowdownMin) * loadFraction;
    const loadSpeedFactor = this.state.cart.carried ? 1 - loadPenalty : 1;
    const speed = (CONFIG.player.speed + this.levelStats.speed) * loadSpeedFactor;
    p.x = this.clamp(p.x + dx * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);
    this.resolveObstacleCollisions(p, CONFIG.player.radius, this.state.cart.carried);
    p.y = this.clamp(p.y + dy * speed * dt, CONFIG.map.wall + CONFIG.player.radius, this.world - CONFIG.map.wall - CONFIG.player.radius);
    this.resolveObstacleCollisions(p, CONFIG.player.radius, this.state.cart.carried);
    this.updateCart(dt);

    const dayNight = this.getDayNightState();
    this.state.dayNight = dayNight.isNight ? 'night' : 'day';
    this.state.phaseElapsed = dayNight.phaseElapsed;
    this.state.nightNumber = this.nightNumber;
    if (dayNight.isNight && !this.wasNight) this.beginNight();
    this.wasNight = dayNight.isNight;
    if (dayNight.isNight && this.hordeTarget > 0
      && dayNight.phaseElapsed < CONFIG.dayNight.dayDuration - CONFIG.dayNight.spawnStopBeforeDawn) {
      const spawnWindow = CONFIG.dayNight.dayDuration - CONFIG.dayNight.spawnStopBeforeDawn;
      const progress = Math.min(1, dayNight.phaseElapsed / spawnWindow);
      // Divide a noite em cinco ondas; cada fatia distribui sua parcela gradualmente.
      const distribution = CONFIG.dayNight.spawnWaveDistribution;
      const stageProgress = progress * distribution.length;
      const completedStages = Math.min(distribution.length, Math.floor(stageProgress));
      let scheduledFraction = distribution.slice(0, completedStages).reduce((sum, share) => sum + share, 0);
      if (completedStages < distribution.length) {
        scheduledFraction += distribution[completedStages] * (stageProgress - completedStages);
      }
      const targetScheduled = Math.min(this.hordeTarget, Math.ceil(this.hordeTarget * scheduledFraction));
      // Agenda no máximo um nascimento por atualização; se o mapa atingir o limite vivo, não acumula uma rajada para depois.
      if (this.hordeScheduled < targetScheduled) {
        this.hordeScheduled += 1;
        if (this.state.enemies.length < CONFIG.dayNight.maxAlive) this.spawnHordeEnemy();
      }
    }
    this.updateTreeSpawner(dt); this.updateRockSpawner(dt); this.moveEnemies(dt); this.moveShots(dt); this.state.swordSwingTimer = Math.max(0, this.state.swordSwingTimer - dt); this.state.treeChopTimer = Math.max(0, this.state.treeChopTimer - dt); this.state.rockMineTimer = Math.max(0, this.state.rockMineTimer - dt); this.autoAttack(); this.collectXp(dt); this.collectWood(); this.collectStone(); this.collectBronze(); this.deliverWoodToHouseUnderConstruction(); this.deliverMaterialsToRefinery(); this.deliverStonesToRefinery(); this.processRefinery(dt); this.autoStoreItemsAtHouse(); this.repairCartWithWood(); this.autoLoadCartFromInventory();
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

  private placeRefinery() {
    const margin = CONFIG.map.wall + CONFIG.refinery.wallMargin;
    for (let attempt = 0; attempt < 1200; attempt++) {
      const x = margin + Math.random() * (this.world - margin * 2);
      const y = margin + Math.random() * (this.world - margin * 2);
      if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.refinery.playerClearRadius) continue;
      if (Math.hypot(x - this.state.house.x, y - this.state.house.y) < CONFIG.refinery.treeClearRadius + 80) continue;
      if (Math.hypot(x - this.state.cart.x, y - this.state.cart.y) < 120) continue;
      if (this.state.trees.some(tree => Math.hypot(x - this.treeBase(tree).x, y - this.treeBase(tree).y) < CONFIG.refinery.treeClearRadius + this.treeFootprintRadius(tree))) continue;
      if (this.state.rocks.some(rock => Math.hypot(x - rock.x, y - rock.y) < CONFIG.refinery.rockClearRadius + this.rockFootprintRadius(rock))) continue;
      this.state.refinery = { x, y, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 };
      return;
    }
    this.state.refinery = { x: this.world * 0.72, y: this.world * 0.72, woodDelivered: 0, stoneDelivered: 0, built: false, stoneStock: 0, stonesProcessed: 0, bronzeProduced: 0 };
  }

  private placeHouse() {
    const margin = CONFIG.map.wall + CONFIG.house.wallMargin;
    for (let attempt = 0; attempt < 1200; attempt++) {
      const x = margin + Math.random() * (this.world - margin * 2);
      const y = margin + Math.random() * (this.world - margin * 2);
      if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.house.playerClearRadius) continue;
      if (this.state.trees.some(tree => Math.hypot(x - this.treeBase(tree).x, y - this.treeBase(tree).y) < CONFIG.house.treeClearRadius + this.treeFootprintRadius(tree))) continue;
      if (Math.hypot(x - this.state.cart.x, y - this.state.cart.y) < 90) continue;
      this.state.house = { x, y, woodDelivered: 0, built: false, inventory: [] };
      return;
    }
    // Fallback determinístico em uma região afastada do ponto inicial do jogador.
    this.state.house = { x: this.world * 0.25, y: this.world * 0.25, woodDelivered: 0, built: false, inventory: [] };
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

  private validTreePosition(x: number, y: number, minSpacing = 0, size: Tree['size'] = 'large', allowNearHouse = false) {
    const margin = CONFIG.map.wall + 80;
    if (x < margin || y < margin || x > this.world - margin || y > this.world - margin) return false;
    if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.trees.noSpawnRadius) return false;
    const candidate = { x, y, size } as Tree;
    const candidateBase = this.treeBase(candidate);
    const candidateFootprint = this.treeFootprintRadius(candidate);
    if (this.state.rocks.some(rock => Math.hypot(candidateBase.x - rock.x, candidateBase.y - rock.y) < candidateFootprint + this.rockFootprintRadius(rock))) return false;
    const houseDistance = Math.hypot(candidateBase.x - this.state.house.x, candidateBase.y - this.state.house.y);
    if (allowNearHouse) {
      if (houseDistance < candidateFootprint + 38) return false;
    } else if (houseDistance < CONFIG.house.treeClearRadius + candidateFootprint) {
      return false;
    }
    if (Math.hypot(candidateBase.x - this.state.cart.x, candidateBase.y - this.state.cart.y) < candidateFootprint + 38) return false;
    if (Math.hypot(candidateBase.x - this.state.refinery.x, candidateBase.y - this.state.refinery.y) < CONFIG.refinery.treeClearRadius + candidateFootprint) return false;
    return this.state.trees.every(tree => {
      const base = this.treeBase(tree);
      return Math.hypot(candidateBase.x - base.x, candidateBase.y - base.y) >= Math.max(minSpacing, candidateFootprint + this.treeFootprintRadius(tree));
    });
  }

  private spawnTree(initial = false) {
    if (this.state.trees.length >= CONFIG.trees.max) return false;
    const margin = CONFIG.map.wall + 80;
    const roll = Math.random();
    const size: Tree['size'] = roll < CONFIG.trees.sizeWeights.small ? 'small' : roll < CONFIG.trees.sizeWeights.small + CONFIG.trees.sizeWeights.medium ? 'medium' : 'large';
    // As árvores iniciais não têm espaçamento artificial; só respeitam colisões e áreas proibidas.
    const minSpacing = 0;
    let position: Vec | null = null;

    // Uma árvore espontânea perto da casa é rara; depois de existir, ela atrai normalmente.
    if (!initial && Math.random() < CONFIG.trees.rareHouseSpawnChance) {
      for (let attempt = 0; attempt < 120 && !position; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const minimumDistance = this.treeFootprintRadius({ x: 0, y: 0, size } as Tree) + 42;
        const distance = minimumDistance + Math.random() * Math.max(1, CONFIG.trees.rareHouseRadius - minimumDistance);
        const x = this.state.house.x + Math.cos(angle) * distance;
        const y = this.state.house.y + Math.sin(angle) * distance;
        if (this.validTreePosition(x, y, minSpacing, size, true)) position = { x, y };
      }
    }

    // A densidade local pesa a escolha do núcleo; a influência probabilística satura em 20 árvores.
    if (!initial && !position && this.state.trees.length > 0) {
      const nearbyCount = (tree: Tree) => this.state.trees.filter(other =>
        Math.hypot(other.x - tree.x, other.y - tree.y) <= CONFIG.trees.attractionRadius
      ).length;
      const weightedAnchors = this.state.trees.map(tree => {
        const count = Math.min(CONFIG.trees.attractionMaxNearby, nearbyCount(tree));
        return { tree, count, weight: 1 + count * count };
      });
      const totalWeight = weightedAnchors.reduce((sum, item) => sum + item.weight, 0);
      let ticket = Math.random() * totalWeight;
      let selected = weightedAnchors[weightedAnchors.length - 1];
      for (const item of weightedAnchors) {
        ticket -= item.weight;
        if (ticket <= 0) { selected = item; break; }
      }

      const count = Math.max(1, Math.min(CONFIG.trees.attractionMaxNearby, selected.count));
      const attractionChance = count <= 5
        ? 0.1 + (count - 1) * 0.05
        : count <= 10
          ? 0.3 + (count - 5) * 0.05
          : count <= 15
            ? 0.55 + (count - 10) * 0.03
            : Math.min(CONFIG.trees.attractionMaxChance, 0.7 + (count - 15) * 0.02);
      if (Math.random() < attractionChance) {
        const anchor = selected.tree;
        const anchorNearHouse = Math.hypot(anchor.x - this.state.house.x, anchor.y - this.state.house.y) <= CONFIG.trees.rareHouseRadius;
        for (let attempt = 0; attempt < 120 && !position; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const distance = 90 + Math.random() * 80;
          const x = anchor.x + Math.cos(angle) * distance;
          const y = anchor.y + Math.sin(angle) * distance;
          if (this.validTreePosition(x, y, minSpacing, size, anchorNearHouse)) position = { x, y };
        }
      }
    }

    // O restante dos nascimentos continua podendo ocupar qualquer região válida do mapa.
    for (let attempt = 0; attempt < 500 && !position; attempt++) {
      const x = margin + Math.random() * (this.world - margin * 2);
      const y = margin + Math.random() * (this.world - margin * 2);
      if (this.validTreePosition(x, y, minSpacing, size)) position = { x, y };
    }
    if (!position) return false;
    this.state.trees.push({ id: this.nextId++, x: position.x, y: position.y, hits: CONFIG.trees.hitsToCut, size });
    return true;
  }

  private rockSpawnDuration() {
    return Math.max(CONFIG.rocks.spawnMin, CONFIG.rocks.spawnBase - CONFIG.rocks.spawnReductionPerRock * this.state.rocks.length);
  }

  private spawnInitialRocks() {
    for (let i = 0; i < CONFIG.rocks.startCount; i++) this.spawnRock();
  }

  private updateRockSpawner(dt: number) {
    this.rockSpawnCountdown -= dt;
    if (this.rockSpawnCountdown > 0) return;
    if (this.state.rocks.length < CONFIG.rocks.max) this.spawnRock();
    this.rockSpawnCountdown = this.rockSpawnDuration();
  }

  private rockFootprintRadius(rock: Rock) {
    return rock.size === 'small' ? 16 : rock.size === 'medium' ? 23 : 31;
  }

  private validRockPosition(x: number, y: number, size: Rock['size'], allowNearRefinery = false) {
    const margin = CONFIG.map.wall + 80;
    if (x < margin || y < margin || x > this.world - margin || y > this.world - margin) return false;
    if (Math.hypot(x - this.state.player.x, y - this.state.player.y) < CONFIG.rocks.noSpawnRadius) return false;
    const radius = size === 'small' ? 16 : size === 'medium' ? 23 : 31;
    if (Math.hypot(x - this.state.house.x, y - this.state.house.y) < CONFIG.house.treeClearRadius + radius) return false;
    const refineryDistance = Math.hypot(x - this.state.refinery.x, y - this.state.refinery.y);
    if (!allowNearRefinery && refineryDistance < CONFIG.refinery.rockClearRadius + radius) return false;
    if (allowNearRefinery && refineryDistance < radius + 45) return false;
    if (allowNearRefinery && refineryDistance > CONFIG.refinery.rareRockSpawnRadius) return false;
    if (Math.hypot(x - this.state.cart.x, y - this.state.cart.y) < radius + 38) return false;
    if (this.state.trees.some(tree => Math.hypot(x - this.treeBase(tree).x, y - this.treeBase(tree).y) < radius + this.treeFootprintRadius(tree))) return false;
    if (this.state.rocks.filter(rock => Math.hypot(x - rock.x, y - rock.y) <= CONFIG.rocks.attractionRadius).length >= CONFIG.rocks.attractionMaxNearby) return false;
    return this.state.rocks.every(rock => Math.hypot(x - rock.x, y - rock.y) >= radius + this.rockFootprintRadius(rock) + 24);
  }

  private spawnRock() {
    if (this.state.rocks.length >= CONFIG.rocks.max) return false;
    const roll = Math.random();
    const size: Rock['size'] = roll < CONFIG.rocks.sizeWeights.small
      ? 'small'
      : roll < CONFIG.rocks.sizeWeights.small + CONFIG.rocks.sizeWeights.medium ? 'medium' : 'large';
    const margin = CONFIG.map.wall + 80;
    let position: Vec | null = null;
    let clusterId: number | null = null;

    // Nascimento perto da refinaria é raro e independente de qualquer atração.
    if (Math.random() < CONFIG.refinery.rareRockSpawnChance) {
      for (let attempt = 0; attempt < 120 && !position; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 45 + Math.random() * Math.max(1, CONFIG.refinery.rareRockSpawnRadius - 45);
        const x = this.state.refinery.x + Math.cos(angle) * distance;
        const y = this.state.refinery.y + Math.sin(angle) * distance;
        if (this.validRockPosition(x, y, size, true)) position = { x, y };
      }
    }

    // A densidade de pedras continua sendo a única atração de agrupamento.
    if (!position && this.state.rocks.length > 0) {
      const anchors = this.state.rocks.map(rock => ({
        rock,
        count: this.state.rocks.filter(other => other.clusterId === rock.clusterId).length,
      })).filter(item => item.count < CONFIG.rocks.attractionMaxNearby);
      if (anchors.length > 0) {
        const weighted = anchors.map(item => ({ ...item, weight: 1 + item.count * item.count }));
        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        let ticket = Math.random() * totalWeight;
        let selected = weighted[weighted.length - 1];
        for (const item of weighted) {
          ticket -= item.weight;
          if (ticket <= 0) { selected = item; break; }
        }
        const count = Math.max(1, selected.count);
        const attractionChance = Math.min(CONFIG.rocks.attractionMaxChance, 0.1 + count * 0.05);
        if (Math.random() < attractionChance) {
          for (let attempt = 0; attempt < 160 && !position; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 90 + Math.random() * 80;
            const x = selected.rock.x + Math.cos(angle) * distance;
            const y = selected.rock.y + Math.sin(angle) * distance;
            if (this.validRockPosition(x, y, size)) {
              position = { x, y };
              clusterId = selected.rock.clusterId;
            }
          }
        }
      }
    }

    // Fora dos agrupamentos, a região nordeste tem prioridade, sem bloquear o resto do mapa.
    for (let attempt = 0; attempt < 500 && !position; attempt++) {
      const northEast = Math.random() < CONFIG.rocks.northEastSpawnChance;
      const x = northEast
        ? margin + CONFIG.rocks.northEastMinX * (this.world - margin * 2)
          + Math.random() * (this.world - margin * 2) * (1 - CONFIG.rocks.northEastMinX)
        : margin + Math.random() * (this.world - margin * 2);
      const y = northEast
        ? margin + Math.random() * (this.world - margin * 2) * CONFIG.rocks.northEastMaxY
        : margin + Math.random() * (this.world - margin * 2);
      if (!this.validRockPosition(x, y, size)) continue;
      position = { x, y };
    }
    if (!position) return false;
    if (clusterId === null) clusterId = this.nextRockClusterId++;
    this.state.rocks.push({ id: this.nextId++, x: position.x, y: position.y, hits: CONFIG.rocks.hitsToBreak[size], size, clusterId });
    return true;
  }

  private isPlayerAtRock(rock: Rock) {
    return Math.hypot(rock.x - this.state.player.x, rock.y - this.state.player.y)
      <= CONFIG.rocks.mineRange + this.rockFootprintRadius(rock);
  }

  private hitRock(id: number) {
    const rock = this.state.rocks.find(value => value.id === id);
    if (!rock) return;
    rock.hits -= 1;
    if (Math.random() < CONFIG.rocks.dropChance) {
      const angle = Math.random() * Math.PI * 2;
      const distance = this.rockFootprintRadius(rock) + 5;
      this.state.stoneDrops.push({ id: this.nextId++, x: rock.x + Math.cos(angle) * distance, y: rock.y + Math.sin(angle) * distance });
    }
    if (rock.hits <= 0) this.state.rocks = this.state.rocks.filter(value => value.id !== id);
  }

  private collectStone() {
    for (const drop of [...this.state.stoneDrops]) {
      if (Math.hypot(drop.x - this.state.player.x, drop.y - this.state.player.y) > CONFIG.player.radius + 10) continue;
      const result = addToInventory(this.state.inventory, 'stone', 1, CONFIG.inventory);
      if (result.added === 0) continue;
      this.state.inventory = result.inventory;
      this.state.stoneDrops = this.state.stoneDrops.filter(value => value.id !== drop.id);
    }
  }

  private cutTree(id: number) {
    const tree = this.state.trees.find(value => value.id === id);
    if (!tree) return;
    this.state.trees = this.state.trees.filter(value => value.id !== id);
    const roll = Math.random();
    const amount = tree.size === 'small' ? 1 : tree.size === 'medium' ? (roll < 0.5 ? 1 : 2) : (roll < 0.2 ? 1 : roll < 0.5 ? 2 : 3);
    const base = this.treeBase(tree);
    this.state.woodDrops.push({ id: this.nextId++, x: base.x, y: base.y, amount });
  }

  private collectWood() {
    for (const drop of [...this.state.woodDrops]) {
      if (Math.hypot(drop.x - this.state.player.x, drop.y - this.state.player.y) > CONFIG.player.radius + 10) continue;
      const result = addToInventory(this.state.inventory, 'wood', drop.amount, CONFIG.inventory);
      if (result.added === 0) continue;
      this.state.inventory = result.inventory;
      if (result.added >= drop.amount) this.state.woodDrops = this.state.woodDrops.filter(value => value.id !== drop.id);
      else drop.amount -= result.added;
    }
  }

  private initializeDayNight() {
    this.startAtNight = Math.random() < 0.5;
    this.state.startedAtNight = this.startAtNight;
    this.wasNight = false;
    this.nightNumber = 0;
    this.hordeTarget = 0;
    this.hordeSpawned = 0;
    this.hordeScheduled = 0;
    const phase = this.getDayNightState();
    this.state.dayNight = phase.isNight ? 'night' : 'day';
    this.state.phaseElapsed = phase.phaseElapsed;
    this.state.nightNumber = 0;
    if (phase.isNight) this.beginNight();
    this.wasNight = phase.isNight;
  }

  getDayNightState() {
    const phaseElapsedTotal = (this.elapsed + (this.startAtNight ? 0 : CONFIG.dayNight.dayDuration)) % CONFIG.dayNight.cycle;
    const isNight = phaseElapsedTotal < CONFIG.dayNight.dayDuration;
    const phaseElapsed = isNight ? phaseElapsedTotal : phaseElapsedTotal - CONFIG.dayNight.dayDuration;
    const vulnerability = isNight ? 0 : CONFIG.dayNight.dayDamageVulnerability;
    return { isNight, phaseElapsed, vulnerability };
  }

  private beginNight() {
    this.nightNumber += 1;
    this.state.nightNumber = this.nightNumber;
    this.state.wave = this.nightNumber;
    this.hordeTarget = CONFIG.dayNight.firstNightSpawnCount + (this.nightNumber - 1) * CONFIG.dayNight.addedPerNight;
    this.hordeSpawned = 0;
    this.hordeScheduled = 0;
  }

  private spawnHordeEnemy() {
    if (this.state.enemies.length >= CONFIG.dayNight.maxAlive) return;
    this.hordeSpawned += 1;
    const player = this.state.player;
    const margin = CONFIG.map.wall + CONFIG.enemy.radius + 8;
    let x = player.x, y = player.y;
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = CONFIG.dayNight.spawnMinDistance
        + Math.random() * (CONFIG.dayNight.spawnMaxDistance - CONFIG.dayNight.spawnMinDistance);
      const candidateX = player.x + Math.cos(angle) * distance;
      const candidateY = player.y + Math.sin(angle) * distance;
      if (candidateX < margin || candidateX > this.world - margin || candidateY < margin || candidateY > this.world - margin) continue;
      x = candidateX;
      y = candidateY;
      placed = true;
      break;
    }
    if (!placed) {
      // Fallback for unusual edge positions: move toward the map center and keep the spawn inside bounds.
      const dx = this.world / 2 - player.x;
      const dy = this.world / 2 - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      x = this.clamp(player.x + dx / distance * CONFIG.dayNight.spawnMinDistance, margin, this.world - margin);
      y = this.clamp(player.y + dy / distance * CONFIG.dayNight.spawnMinDistance, margin, this.world - margin);
    }
    this.state.enemies.push({ id: this.nextId++, x, y, hp: CONFIG.enemy.health + (this.state.wave - 1) * CONFIG.enemy.healthPerWave, hitWait: 0, wobble: Math.random() * 8 });
  }

  private enemyMovementDirection(enemy: Enemy, targetX: number, targetY: number, obstacles: Array<Vec & { radius: number }>): Vec {
    const distance = Math.hypot(targetX, targetY) || 1;
    const dirX = targetX / distance;
    const dirY = targetY / distance;
    let steerX = dirX;
    let steerY = dirY;
    const sensorDistance = CONFIG.enemy.obstacleAvoidanceDistance;

    for (const obstacle of obstacles) {
      const offsetX = obstacle.x - enemy.x;
      const offsetY = obstacle.y - enemy.y;
      const forward = offsetX * dirX + offsetY * dirY;
      const lateral = Math.abs(offsetX * dirY - offsetY * dirX);
      const clearance = CONFIG.enemy.radius + obstacle.radius + CONFIG.enemy.obstacleAvoidanceBuffer;
      if (forward <= 0 || forward > sensorDistance + clearance || lateral > clearance) continue;

      // Desvia para o lado oposto ao obstáculo; em empate, o ID mantém o lado estável.
      const cross = dirX * offsetY - dirY * offsetX;
      const side = Math.abs(cross) < 0.001 ? (enemy.id % 2 === 0 ? 1 : -1) : cross > 0 ? -1 : 1;
      const urgency = 1 - Math.min(forward, sensorDistance + clearance) / (sensorDistance + clearance);
      const strength = 1.15 + urgency;
      steerX += -dirY * side * strength;
      steerY += dirX * side * strength;
    }

    const magnitude = Math.hypot(steerX, steerY) || 1;
    return { x: steerX / magnitude, y: steerY / magnitude };
  }

  private moveEnemies(dt: number) {
    const p = this.state.player;
    const obstacles = this.obstacleCircles(false);
    for (const e of this.state.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const speed = CONFIG.enemy.speed + Math.floor((this.state.wave - 1) / CONFIG.enemy.speedEveryWaves) * CONFIG.enemy.speedIncrease;
      const direction = this.enemyMovementDirection(e, dx, dy, obstacles);
      e.x += direction.x * speed * dt; e.y += direction.y * speed * dt;
      e.hitWait -= dt;
      const contactDistance = Math.hypot(p.x - e.x, p.y - e.y);
      if (contactDistance <= CONFIG.player.radius + CONFIG.enemy.radius + CONFIG.enemy.playerContactSlack && e.hitWait <= 0) {
        e.hitWait = CONFIG.enemy.contactCooldown;
        if (Math.random() > CONFIG.player.dodge + this.levelStats.dodge) {
          const waveDamage = CONFIG.enemy.contactDamage + Math.floor((this.state.wave - 1) / CONFIG.enemy.contactDamageEveryWaves) * CONFIG.enemy.contactDamageIncrease;
          const damage = Math.max(1, Math.round(waveDamage * (this.getDayNightState().isNight ? 1 : 1.5) - CONFIG.player.armor - this.levelStats.armor));
          p.hp -= damage;
          this.addFloatingDamage(p.x, p.y - CONFIG.player.radius * 1.8, damage, '#ff4545');
        }
      }
    }
    this.separateEnemies();
    for (const enemy of this.state.enemies) {
      this.resolveObstacleCollisions(enemy, CONFIG.enemy.radius, false);
      this.resolveRockBoxCollisions(enemy);
    }

    const minimumDistance = CONFIG.player.radius + CONFIG.enemy.radius;
    const minX = CONFIG.map.wall + CONFIG.enemy.radius;
    const maxX = this.world - CONFIG.map.wall - CONFIG.enemy.radius;
    const minY = minX;
    const maxY = maxX;
    for (const enemy of this.state.enemies) {
      let dx = enemy.x - p.x;
      let dy = enemy.y - p.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= minimumDistance) continue;
      if (distance === 0) {
        const angle = ((enemy.id * 137.508) % 360) * Math.PI / 180;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        enemy.x = this.clamp(p.x + dx * minimumDistance, minX, maxX);
        enemy.y = this.clamp(p.y + dy * minimumDistance, minY, maxY);
        continue;
      }
      const push = minimumDistance - distance;
      enemy.x = this.clamp(enemy.x + dx / distance * push, minX, maxX);
      enemy.y = this.clamp(enemy.y + dy / distance * push, minY, maxY);
    }
  }

  private treeScale(tree: Tree) {
    return tree.size === 'small' ? 1.5 : tree.size === 'medium' ? 2.2 : 3;
  }

  private treeBase(tree: Tree): Vec {
    return { x: tree.x, y: tree.y + 29 * this.treeScale(tree) };
  }

  private treeFootprintRadius(tree: Tree) {
    return 20 * this.treeScale(tree);
  }

  private obstacleCircles(ignoreCart = false) {
    const circles: Array<Vec & { radius: number }> = this.state.trees.map(tree => ({
      ...this.treeBase(tree),
      radius: 8 * this.treeScale(tree),
    }));
    circles.push(...this.state.rocks.map(rock => ({ x: rock.x, y: rock.y, radius: this.rockFootprintRadius(rock) })));
    circles.push({ x: this.state.house.x, y: this.state.house.y + 1, radius: 38 });
    circles.push({ x: this.state.refinery.x, y: this.state.refinery.y + 1, radius: 38 });
    if (!ignoreCart) circles.push({ x: this.state.cart.x, y: this.state.cart.y + 1, radius: 30 });
    return circles;
  }

  private resolveRockBoxCollisions(enemy: Enemy) {
    for (const rock of this.state.rocks) {
      const half = this.rockFootprintRadius(rock);
      const halfX = half + CONFIG.enemy.radius;
      const halfY = half + CONFIG.enemy.radius;
      const dx = enemy.x - rock.x;
      const dy = enemy.y - rock.y;
      if (Math.abs(dx) >= halfX || Math.abs(dy) >= halfY) continue;
      const pushX = halfX - Math.abs(dx);
      const pushY = halfY - Math.abs(dy);
      if (pushX < pushY) enemy.x = this.clamp(rock.x + (dx < 0 ? -halfX : halfX), CONFIG.map.wall + CONFIG.enemy.radius, this.world - CONFIG.map.wall - CONFIG.enemy.radius);
      else enemy.y = this.clamp(rock.y + (dy < 0 ? -halfY : halfY), CONFIG.map.wall + CONFIG.enemy.radius, this.world - CONFIG.map.wall - CONFIG.enemy.radius);
    }
  }

  private resolveObstacleCollisions(entity: Vec, radius: number, ignoreCart = false) {
    for (let pass = 0; pass < 3; pass++) {
      for (const obstacle of this.obstacleCircles(ignoreCart)) {
        let dx = entity.x - obstacle.x;
        let dy = entity.y - obstacle.y;
        let distance = Math.hypot(dx, dy);
        const minimum = radius + obstacle.radius;
        if (distance >= minimum) continue;
        if (distance === 0) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const push = minimum - distance;
        entity.x = this.clamp(entity.x + dx / distance * push, CONFIG.map.wall + radius, this.world - CONFIG.map.wall - radius);
        entity.y = this.clamp(entity.y + dy / distance * push, CONFIG.map.wall + radius, this.world - CONFIG.map.wall - radius);
      }
    }
  }

  private isPlayerAtTreeShadow(tree: Tree) {
    const scale = this.treeScale(tree);
    const shadow = this.treeBase(tree);
    const dx = this.state.player.x - shadow.x;
    const dy = this.state.player.y - shadow.y;
    const rx = 19 * scale + CONFIG.player.radius;
    const ry = 8 * scale + CONFIG.player.radius;
    return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
  }

  private separateEnemies() {
    const { minDistance, iterations } = CONFIG.enemy.separation;
    const cellSize = 64;
    const minX = CONFIG.map.wall + CONFIG.enemy.radius;
    const maxX = this.world - CONFIG.map.wall - CONFIG.enemy.radius;
    const minY = minX;
    const maxY = maxX;

    for (let iteration = 0; iteration < iterations; iteration++) {
      const grid = new Map<string, Enemy[]>();
      const cellKey = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
      for (const enemy of this.state.enemies) {
        const key = cellKey(enemy.x, enemy.y);
        const cell = grid.get(key);
        if (cell) cell.push(enemy);
        else grid.set(key, [enemy]);
      }

      const cellReach = Math.ceil(minDistance / cellSize);
      for (const enemy of this.state.enemies) {
        const cellX = Math.floor(enemy.x / cellSize);
        const cellY = Math.floor(enemy.y / cellSize);
        for (let offsetY = -cellReach; offsetY <= cellReach; offsetY++) {
          for (let offsetX = -cellReach; offsetX <= cellReach; offsetX++) {
            const neighbors = grid.get(`${cellX + offsetX},${cellY + offsetY}`);
            if (!neighbors) continue;
            for (const other of neighbors) {
              if (other.id <= enemy.id) continue;
              let dx = other.x - enemy.x;
              let dy = other.y - enemy.y;
              let distance = Math.hypot(dx, dy);
              if (distance >= minDistance) continue;
              if (distance === 0) {
                const angle = ((enemy.id * 31 + other.id * 17) % 360) * Math.PI / 180;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
                distance = 1;
              }
              const overlap = minDistance - distance;
              const pushX = (dx / distance) * overlap / 2;
              const pushY = (dy / distance) * overlap / 2;
              enemy.x = this.clamp(enemy.x - pushX, minX, maxX);
              enemy.y = this.clamp(enemy.y - pushY, minY, maxY);
              other.x = this.clamp(other.x + pushX, minX, maxX);
              other.y = this.clamp(other.y + pushY, minY, maxY);
            }
          }
        }
      }
    }
  }

  private autoAttack() {
    if (this.state.cart.carried) return;
    const weapon = CONFIG.weapons[this.state.weapon];
    const speedBonus = this.levelStats.attackSpeed;
    if (this.attackTimer < 1 / (weapon.attackSpeed * (1 + speedBonus))) return;
    const p = this.state.player;
    const target = this.state.enemies.map(e => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).filter(v => v.d <= weapon.range).sort((a, b) => a.d - b.d)[0];
    if (!target) {
      const treeTarget = this.state.trees
        .filter(tree => this.isPlayerAtTreeShadow(tree))
        .map(tree => ({ tree, d: Math.hypot(this.treeBase(tree).x - p.x, this.treeBase(tree).y - p.y) }))
        .sort((a, b) => a.d - b.d)[0];
      const rockTarget = this.state.rocks
        .filter(rock => this.isPlayerAtRock(rock))
        .map(rock => ({ rock, d: Math.hypot(rock.x - p.x, rock.y - p.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!treeTarget && !rockTarget) return;
      this.attackTimer = 0;
      if (treeTarget && (!rockTarget || treeTarget.d <= rockTarget.d)) {
        const treeBase = this.treeBase(treeTarget.tree);
        this.state.treeChopAngle = Math.atan2(treeBase.y - p.y, treeBase.x - p.x);
        this.state.treeChopTimer = 0.2;
        treeTarget.tree.hits -= 1;
        if (treeTarget.tree.hits <= 0) this.cutTree(treeTarget.tree.id);
      } else if (rockTarget) {
        this.state.rockMineAngle = Math.atan2(rockTarget.rock.y - p.y, rockTarget.rock.x - p.x);
        this.state.rockMineTimer = 0.22;
        this.hitRock(rockTarget.rock.id);
      }
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
      }).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, CONFIG.weapons.espada.maxTargets);
      for (const enemy of hits) {
        const vulnerability = this.getDayNightState().vulnerability;
        const damage = (weapon.damage + this.state.player.level * 0.3) * (1 + vulnerability);
        enemy.hp -= damage;
        this.addFloatingDamage(enemy.x, enemy.y - CONFIG.enemy.radius * 1.7, damage, '#ffffff');
        if (this.state.classId === 'druida') this.druidRegenTimer = 3;
      }
      for (const enemy of hits.filter(e => e.hp <= 0)) this.killEnemy(enemy.id);
      for (const enemy of hits) {
        if (enemy.hp <= 0 || !this.state.enemies.some(alive => alive.id === enemy.id)) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        const destination = {
          x: enemy.x + dx / distance * CONFIG.weapons.espada.knockback,
          y: enemy.y + dy / distance * CONFIG.weapons.espada.knockback,
        };
        this.resolveObstacleCollisions(destination, CONFIG.enemy.radius);
        enemy.x = destination.x;
        enemy.y = destination.y;
      }
    } else {
      const dx = target.e.x - p.x, dy = target.e.y - p.y, dist = Math.hypot(dx, dy) || 1;
      const explosive = this.state.classId === 'mago' && (this.mageAttackCount + 1) % CONFIG.mageExplosion.everyAttack === 0;
      if (this.state.classId === 'mago') this.mageAttackCount = (this.mageAttackCount + 1) % CONFIG.mageExplosion.everyAttack;
      this.state.shots.push({ id: this.nextId++, x: p.x, y: p.y, vx: dx / dist * weapon.projectileSpeed, vy: dy / dist * weapon.projectileSpeed, damage: weapon.damage + this.state.player.level * 0.3, kind: weapon.kind, life: weapon.range / weapon.projectileSpeed + 0.2, explosive });
    }
  }

  private moveShots(dt: number) {
    for (const shot of [...this.state.shots]) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      const target = this.state.enemies.find(e => Math.hypot(e.x - shot.x, e.y - shot.y) < CONFIG.enemy.radius + 6);
      if (target) {
        this.state.shots = this.state.shots.filter(s => s.id !== shot.id);
        if (shot.explosive) {
          const impact = { x: target.x, y: target.y };
          this.state.explosions.push({ ...impact, id: this.nextId++, age: 0, duration: 0.24 });
          const damage = shot.damage * CONFIG.mageExplosion.damageMultiplier * (1 + this.getDayNightState().vulnerability);
          const hits = this.state.enemies
            .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - impact.x, enemy.y - impact.y) }))
            .filter(({ distance }) => distance <= CONFIG.mageExplosion.radius)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, CONFIG.mageExplosion.maxTargets)
            .map(({ enemy }) => enemy);
          for (const enemy of hits) {
            enemy.hp -= damage;
            this.addFloatingDamage(enemy.x, enemy.y - CONFIG.enemy.radius * 1.7, damage, '#ffffff');
          }
          for (const enemy of hits.filter(enemy => enemy.hp <= 0)) this.killEnemy(enemy.id);
        } else {
          const effectiveDamage = shot.damage * (1 + this.getDayNightState().vulnerability);
          target.hp -= effectiveDamage;
          this.addFloatingDamage(target.x, target.y - CONFIG.enemy.radius * 1.7, effectiveDamage, '#ffffff');
          if (this.state.classId === 'druida') this.druidRegenTimer = 3;
          if (target.hp <= 0) this.killEnemy(target.id);
        }
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
      } else if (distance <= XP_ATTRACTION_RADIUS) {
        const step = Math.min(distance - CONFIG.player.pickupRadius, CONFIG.xp.attractionSpeed * dt);
        orb.x += dx / distance * step;
        orb.y += dy / distance * step;
        if (Math.hypot(p.x - orb.x, p.y - orb.y) <= CONFIG.player.pickupRadius + 0.001) {
          this.state.xpOrbs = this.state.xpOrbs.filter(o => o.id !== orb.id);
          p.xp += orb.value;
        }
      }
    }
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp; p.level += 1; p.nextXp = CONFIG.xp.levelBase + p.level * CONFIG.xp.levelGrowth;
      const healthGain = getAttributeEffectPerLevel(this.state.classId, p.level, 'vida');
      p.maxHp += healthGain; p.hp = Math.min(p.maxHp, p.hp + healthGain);
      this.levelStats.armor += getAttributeEffectPerLevel(this.state.classId, p.level, 'armadura');
      this.levelStats.speed += getAttributeEffectPerLevel(this.state.classId, p.level, 'velocidadeMovimento');
      this.levelStats.attackSpeed += getAttributeEffectPerLevel(this.state.classId, p.level, 'velocidadeAtaque');
      this.levelStats.dodge += getAttributeEffectPerLevel(this.state.classId, p.level, 'esquiva');
    }
  }
  private clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
}