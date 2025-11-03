// -----------------------------
// USTAWIENIA EKRANU
// -----------------------------
const W = window.innerWidth - 10;
const H = window.innerHeight - 10;

// =============================
// SCENA BOOT – GENERACJA TEKSTUR
// =============================
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    this.createPixelTextures();
    this.load.image('ocean', './grafiki/water_background.png');
    this.load.image('ship_player', './grafiki/ship_2.png');
    this.load.image('crate', './grafiki/chest.png')
    this.load.image('island', './grafiki/island1.png')
    this.load.image('template_right', './grafiki/template_right.png')
    this.load.image('menu_background', './grafiki/menu_background2.png')
    this.load.image('button1', './grafiki/button1.png')
    this.load.image('button2', './grafiki/button2.png')
    this.load.image('button3', './grafiki/button3.png')
    this.load.image('button4', './grafiki/button4.png')
  }
  create() { this.scene.start('Game'); }

  createPixelTextures() {
    const g = this.add.graphics();

    // Wrogi statek
    g.clear();
    g.fillStyle(0x4a2a09, 1);
    g.fillRect(0, 12, 44, 38);
    g.fillStyle(0x352006, 1);
    g.fillRect(36, 20, 8, 22);
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(16, 8, 4, 14);
    g.fillRect(24, 6, 4, 16);
    g.fillRect(32, 10, 4, 12);
    g.fillStyle(0xdedede, 1);
    g.fillRect(20, 8, 7, 6);
    g.fillRect(28, 6, 7, 6);
    g.fillRect(36, 10, 5, 5);
    g.lineStyle(2, 0x000000, 0.6); g.strokeRect(0, 12, 44, 38);
    g.generateTexture('ship_enemy', 44, 56);

    // Pocisk
    g.clear();
    g.fillStyle(0x333333, 1); g.fillCircle(4, 4, 4);
    g.generateTexture('bullet', 8, 8);

    // Eksplozja 0..3
    const ex = this.add.graphics();
    for (let i = 0; i < 4; i++) {
      ex.clear();
      ex.fillStyle(0xffe08a, 1); ex.fillCircle(16, 16, 4 + i * 3);
      ex.fillStyle(0xff8a00, 1); ex.fillCircle(16, 16, 2 + i * 2);
      ex.generateTexture('expl_' + i, 32, 32);
    }
    ex.destroy();

    g.destroy();
  }
}

// =============================
// SCENA GRY
// =============================
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init() {
    this.state = {
      score: 0,
      gold: 1000,
      lives: 1,
      hp: 100,
      maxHp: 100,
      level: 1,
      difficultyTimer: 0,
      timeAlive: 0,
      shopOpen: false,
      upgrades: { movement: 1.0, fireRate: 1.0, armor: 0.0, damage: 1.0 },
      isInvincible: false,
      invincibilityDuration: 0
    };
  }

  create() {
    this.input.on('pointerdown', (pointer) => {
      if (pointer.leftButtonDown()) {
        const now = this.time.now;
        const currentCooldown = 800 / this.state.upgrades.fireRate;
        if (now - this.lastShotTime > currentCooldown) {
          this.shootBullet(pointer);
          this.lastShotTime = now;
        }
        this.isShooting = true;
      }
    });

    this.input.on('pointerup', () => {
      this.isShooting = false;
    });
    this.isShooting = false;    // czy LPM jest trzymany
    this.shootCooldown = 800;   // bazowy czas (ms)
    this.lastShotTime = 0;      // znacznik czasu ostatniego strzału

    // Powtórzone nasłuchy są niepotrzebne, usunięto dla czystości.

    // Włącz klawiaturę i fokus po kliknięciu
    this.input.keyboard.enabled = true;
    this.input.keyboard.preventDefault = true;
    this.input.on('pointerdown', () => {
      if (this.game && this.game.canvas) this.game.canvas.focus();
    });

    // Tło oceanu
    this.bg = this.add.tileSprite(W / 2, H / 2, W, H, 'ocean').setScrollFactor(0);

    // Grupy
    this.crates = this.physics.add.group();
    this.islands = this.physics.add.group({ immovable: true, allowGravity: false });
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image });
    this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image });

    // Gracz
    this.player = this.physics.add.image(W * 0.25, H * 0.5, 'ship_player');
    this.player.setDamping(true).setDrag(0.96).setMaxVelocity(320);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(this.player.width * 0.9, this.player.height * 0.6, true);

    // Sterowanie
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasds = this.input.keyboard.addKeys({
      up: 'W', down: 'S', left: 'A', right: 'D'
    });
    this.keyShop = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
    this.keyRestart = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Kolizje
    this.physics.add.overlap(this.player, this.crates, this.collectCrate, null, this);
    this.physics.add.collider(this.player, this.islands, () => this.hurt(12), null, this);
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitByBullet, null, this);
    this.physics.add.collider(this.player, this.enemies, () => this.hurt(18), null, this);

    this.spawnCfg = {
      enemy: {start: 3200, min:700},
      crate: {start: 5200, min:2400},
      island: {start: 6000, min:2600}
    };

    this.difficultyRampSeconds = 210;

    this._lastDifficultyProgress = 0;

    this._easeIn = (t) => t * t;

    this._difficultyProgress = () => Phaser.Math.Clamp(this.state.timeAlive / this.difficultyRampSeconds, 0, 1);

    // Spawnery
    this.crateEvent = this.time.addEvent({
      delay: this.spawnCfg.crate.start, loop:true, callback: this.spawnCrate, callbackScope: this
    });
    this.islandEvent = this.time.addEvent({
      delay: this.spawnCfg.island.start, loop:true, callback: this.spawnIsland, callbackScope: this
    });
    this.enemyEvent = this.time.addEvent({
      delay: this.spawnCfg.enemy.start, loop:true, callback: this.spawnEnemy, callbackScope: this
    });

    // Timery
    this.lastShot = 0;
    this.invincibilityTimer = null; // NOWA: Timer do zarządzania bonusem

    // UI
    this.scene.launch('UI', { state: this.state, gameScene: this });
  }

  hitByBullet(player, bullet){
    if (!bullet?.body || !player?.body) return;
    
    // Destroy the bullet immediately to prevent it from lingering
    bullet.destroy();

    if(this.state.isInvincible) return;

    this.hurt(12);
  }

  update(time, dt) {
    const delta = dt / 1000;
    // Globalny restart gry klawiszem R – zatrzymaj UI i zrestartuj scenę gry
    if (Phaser.Input.Keyboard.JustDown(this.keyRestart)) {
      this.scene.stop('UI');
      this.scene.restart();
      return;
    }
    if (this.state.hp <= 0) {
      return;
    }

    const currentCooldown = 800 / this.state.upgrades.fireRate;
    if (this.isShooting) {
      if (time - this.lastShotTime > currentCooldown) {
        this.shootBullet(this.input.activePointer);
        this.lastShotTime = time; // zapisz czas ostatniego strzału
      }
    }
    // Ruch tła (mapa R->L)
    this.bg.tilePositionX += 100 * delta;

    // Sterowanie (Strzałki lub WSAD)
    const up = this.cursors.up.isDown || this.wasds.up.isDown;
    const down = this.cursors.down.isDown || this.wasds.down.isDown;
    const left = this.cursors.left.isDown || this.wasds.left.isDown;
    const right = this.cursors.right.isDown || this.wasds.right.isDown;

    const accBase = 300 * this.state.upgrades.movement;
    const turnRate = 200 * this.state.upgrades.movement;

    let ax = 0, ay = 0;
    if (up) ay -= accBase;
    if (down) ay += accBase;
    if (left) ax -= turnRate;
    if (right) ax += turnRate;

    // „Kołysanie” na falach i łagodne hamowanie, by czuć bezwładność
    const sway = Math.sin(this.time.now * 0.002) * 20;
    this.player.setAngle(sway * 0.2);
    this.player.setAcceleration(ax, ay);

    // Minimalne wygaszenie dryfu przy braku wejścia
    if (!up && !down && !left && !right) {
      this.player.setAcceleration(0, 0);
      if (this.player.body.speed < 12) this.player.setVelocity(0, 0);
    }

    // Wizualny efekt nieśmiertelności (miganie)
    if (this.state.isInvincible) {
      this.player.alpha = (Math.floor(time / 80) % 2) ? 0.6 : 1.0;
    } else {
      this.player.alpha = 1.0;
    }

    // Sklep – obsługa klawisza przeniesiona do UIScene, aby uniknąć utraty fokusów

    // Skala trudności
    this.state.timeAlive += delta;
    this.state.difficultyTimer += delta;
    if (this.state.difficultyTimer > 12) {
      this.state.level++;
      this.state.difficultyTimer = 0;
      const newDelay = Math.max(500, this.enemyEvent.delay * 0.92);
      this.enemyEvent.reset({ delay: newDelay, callback: this.spawnEnemy, callbackScope: this, loop: true });
    }
    const prog = this._difficultyProgress();
    if(prog - this._lastDifficultyProgress >= 0.05){
      this._lastDifficultyProgress = prog;
      this.refreshSpawnTimers();
    }

    // Cleanup offscreen
    const killOff = (s) => { if (!s) return; if (s.x < -120 || s.x > W + 120 || s.y < -120 || s.y > H + 120) s.destroy(); };
    this.crates.children.iterate(killOff);
    this.enemies.children.iterate(killOff);
    this.bullets.children.iterate(killOff);
    this.enemyBullets.children.iterate(killOff);
    this.islands.children.iterate(killOff);

    // Aktualizacja pasków HP przeciwników
    this.enemies.children.iterate((enemy) => {
      if (!enemy || !enemy.active) return;
      const maxHp = enemy.data?.values?.maxHp ?? 1;
      const hp = Phaser.Math.Clamp(enemy.data?.values?.hp ?? maxHp, 0, maxHp);
      const ratio = Phaser.Math.Clamp(maxHp > 0 ? hp / maxHp : 0, 0, 1);
      if (enemy.hpBg && enemy.hpFg) {
        const yOffset = enemy.height * 0.6;
        enemy.hpBg.x = enemy.x;
        enemy.hpBg.y = enemy.y - yOffset;
        enemy.hpFg.x = enemy.x;
        enemy.hpFg.y = enemy.y - yOffset;
        const fullWidth = 44 - 4; // dopasowane do barWidth - 4
        enemy.hpFg.width = fullWidth * ratio;
        enemy.hpFg.fillColor = (ratio > 0.5) ? 0x59d66f : (ratio > 0.25 ? 0xffcc66 : 0xff6b6b);
        const vis = ratio < 1 && ratio > 0; // pokazuj tylko jeśli nie full i nie 0
        enemy.hpBg.setVisible(vis);
        enemy.hpFg.setVisible(vis);
      }
    });
  }

  // ---- Logika ----
  shootBullet(pointer) {
  // Jeśli nie ma kursora – użyj domyślnie kierunku w prawo
  const target = pointer ?? this.input.activePointer;
  if (!target || typeof target.worldX !== 'number') return;

  const b = this.bullets.get(this.player.x, this.player.y, 'bullet');
  if (!b) return;

  b.setActive(true).setVisible(true);
  b.setScale(0.8);
  b.body.setCircle(4);

  const dx = target.worldX - this.player.x;
  const dy = target.worldY - this.player.y;
  const angle = Math.atan2(dy, dx);
  const speed = 500;

  b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  b.setRotation(angle);
}

refreshSpawnTimers() {
  const pRaw = this._difficultyProgress();
  const p = this._easeIn(pRaw); // łagodny start

  const lerp = (a, b, t) => a + (b - a) * t;

  const enemyDelay  = Math.max( this.spawnCfg.enemy.min,  Math.floor(lerp(this.spawnCfg.enemy.start,  this.spawnCfg.enemy.min,  p)) );
  const crateDelay  = Math.max( this.spawnCfg.crate.min,  Math.floor(lerp(this.spawnCfg.crate.start,  this.spawnCfg.crate.min,  p)) );
  const islandDelay = Math.max( this.spawnCfg.island.min, Math.floor(lerp(this.spawnCfg.island.start, this.spawnCfg.island.min, p)) );

  // Aktualizacja timerów bez ich kasowania
  if (this.enemyEvent)  this.enemyEvent.reset({ delay: enemyDelay,  callback: this.spawnEnemy,  callbackScope: this, loop: true });
  if (this.crateEvent)  this.crateEvent.reset({ delay: crateDelay,  callback: this.spawnCrate,  callbackScope: this, loop: true });
  if (this.islandEvent) this.islandEvent.reset({ delay: islandDelay, callback: this.spawnIsland, callbackScope: this, loop: true });
}



  spawnCrate() {
    const y = Phaser.Math.Between(40, H - 40);
    const crate = this.crates.create(W + 30, y, 'crate');
    crate.setVelocity(-180, Phaser.Math.Between(-10, 10));
    crate.setScale(.5);
  }

  spawnIsland() {
    if (Math.random() < 0.6) {
      const y = Phaser.Math.Between(60, H - 60);
      const isl = this.islands.create(W + 80, y, 'island');
      isl.body.setImmovable(true);
      this.tweens.add({ targets: isl, x: -120, duration: Phaser.Math.Between(8000, 12000), ease: 'Linear', onComplete: () => isl.destroy() });
    }
  }

  spawnEnemy() {
    const y = Phaser.Math.Between(60, H - 60);
    // Zmieniamy statek gracza na statek wroga (tekstura)
    const e = this.enemies.create(W + 50, y, 'ship_player'); 
    e.setScale(-1, 1); // Zmieniamy skalę na domyślną, bo tekstura wroga jest już gotowa
    e.setDataEnabled();
    const baseHP = 30 + this.state.level * 8;
    e.data.set('hp', baseHP);
    e.data.set('maxHp', baseHP);
    const vx = -(180 + this.state.level * 12 + Phaser.Math.Between(-20, 20));
    e.setVelocity(vx, Phaser.Math.Between(-20, 20));
    e.body.setSize(e.width * 0.9, e.height * 0.6, true);

    // Pasek HP nad przeciwnikiem
    const barWidth = 44;
    const barHeight = 5;
    const bg = this.add.rectangle(e.x, e.y - e.height * 0.6, barWidth, barHeight, 0x1a1a1a).setOrigin(0.5, 0.5).setDepth(9);
    const fg = this.add.rectangle(e.x, e.y - e.height * 0.6, barWidth - 4, barHeight - 2, 0x59d66f).setOrigin(0.5, 0.5).setDepth(10);
    e.hpBg = bg;
    e.hpFg = fg;
    e.on('destroy', () => {
      if (e.hpBg) e.hpBg.destroy();
      if (e.hpFg) e.hpFg.destroy();
    });

    this.time.addEvent({
      delay: Phaser.Math.Between(1200, 2000), callback: () => {
        if (!e.active) return;
        const b = this.enemyBullets.get(e.x - 10, e.y, 'bullet');
        if (!b) return;
        b.setTint(0x222222);
        b.setActive(true).setVisible(true);
        b.body.setCircle(4);
        this.physics.moveTo(b, this.player.x, this.player.y, 300 + this.state.level * 8);
      }, loop: true // Dodałem pętlę dla ciągłego strzelania
    });
  }

  collectCrate(player, crate) {
    crate.destroy();
    this.state.score += 10;
    this.state.gold += 5;

    // Szansa na leczenie (10%)
    if (Math.random() < 0.10) {
      const healAmount = this.state.maxHp * 0.5; // 50% podstawowego zdrowia
      this.state.hp = Math.min(this.state.hp + healAmount, this.state.maxHp);
      // Wizualny efekt leczenia (zielony błysk)
      this.cameras.main.flash(200, 0, 255, 0, false, null, 0.3);
    }

    // Szansa na bonus nieśmiertelności (25%)
    if (Math.random() < 0.25) {
      this.grantInvincibility(8); // Przyznaj 8 sekund nieśmiertelności
    }

    this.game.events.emit('updateUI');
  }

  grantInvincibility(duration) {
    // Jeśli już aktywny, resetujemy/przedłużamy czas
    if (this.invincibilityTimer) {
      this.invincibilityTimer.remove(false);
    }

    this.state.isInvincible = true;
    this.state.invincibilityDuration = duration;

    // Timer odliczający co sekundę
    this.invincibilityTimer = this.time.addEvent({
      delay: 1000,
      repeat: duration,
      callback: () => {
        this.state.invincibilityDuration--;
        this.game.events.emit('updateUI');
      },
      callbackScope: this
    });

    // Event po skończeniu czasu
    this.time.delayedCall(duration * 1000, () => {
      this.state.isInvincible = false;
      this.state.invincibilityDuration = 0;
      this.invincibilityTimer = null;
      this.game.events.emit('updateUI');
    });

    this.game.events.emit('bonusGranted', { type: 'invincibility', duration }); // Powiadom UI o bonusie
    this.game.events.emit('updateUI');
  }

  hitEnemy(bullet, enemy) {
    bullet.destroy();
    const armorPierce = 1 + this.state.upgrades.fireRate * 0.15;
    const baseDamage = 9;
    const finalDamage = baseDamage * armorPierce * this.state.upgrades.damage;
    enemy.data.values.hp -= finalDamage;
    if (enemy.data.values.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    const ex = this.add.sprite(enemy.x, enemy.y, 'expl_0');
    this.tweens.addCounter({
      from: 0, to: 3, duration: 240, onUpdate: (tw) => {
        const f = Math.floor(tw.getValue());
        ex.setTexture('expl_' + f);
      }, onComplete: () => ex.destroy()
    });
    // Usuń pasek HP i przeciwnika
    if (enemy.hpBg) enemy.hpBg.destroy();
    if (enemy.hpFg) enemy.hpFg.destroy();
    enemy.destroy();
    this.state.score += 20;
    this.state.gold += 8;
    this.game.events.emit('updateUI');
  }

  hurt(dmg) {
    if (this.state.isInvincible) return; // Zablokuj obrażenia, jeśli jest nieśmiertelny

    const mitigated = Math.max(1, dmg - this.state.upgrades.armor * 2);
    this.state.hp -= mitigated;
    this.cameras.main.shake(80, 0.004);
    this.game.events.emit('updateUI');
    if (this.state.hp <= 0) this.gameOver();
  }

  gameOver() {
    this.player.setAcceleration(0, 0);
    this.player.setDrag(0.99);
    this.time.removeAllEvents();
    this.enemyEvent && this.enemyEvent.remove(false);
    this.invincibilityTimer && this.invincibilityTimer.remove(false); // NOWE: Usuń timer bonusu
    this.game.events.emit('gameOver');
  }
}

// =============================
// SCENA UI
// =============================
class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }
  init(data) { this.state = data?.state; this.gameScene = data?.gameScene; }
  create() {
    const pad = 12;
    // Panel UI po prawej stronie ekranu
    const rightX = W - pad;
    this.scoreText = this.add.text(rightX, pad, '', { fontSize: 18, color: '#ffd36e' }).setOrigin(1, 0).setDepth(5).setFontFamily('Silkscreen, monospace');
    this.goldText = this.add.text(rightX, pad + 22, '', { fontSize: 18, color: '#ffd36e' }).setOrigin(1, 0).setDepth(5).setFontFamily('Silkscreen, monospace');

    // Pasek życia
    this.hpBg = this.add.rectangle(rightX, pad + 50, 220, 16, 0x222222).setOrigin(1, 0).setDepth(5);
    this.hpBar = this.add.rectangle(rightX - 2, pad + 52, 216, 12, 0x59d66f).setOrigin(1, 0).setDepth(6);

    // Hinty
    this.helpText = this.add.text(rightX, pad + 74, 'Sterowanie: Strzałki/WSAD | LPM (ogień)  |  U – Sklep  |  R – Restart', { fontSize: 14, color: '#b9d3ff' }).setOrigin(1, 0).setDepth(5).setFontFamily('Silkscreen, monospace');

    // Sklep - grafika menu_background w lewym dolnym rogu
    this.shop = this.add.container(-30, H).setDepth(1000).setVisible(false);
    this.shop.setScale(1.5);
    const bg = this.add.image(0, 0, 'menu_background').setOrigin(0, 1); // Origin (0,1) = lewy dolny róg
    this.shop.add([bg]);

    // Funkcja tworząca przycisk z grafiką
    const mkBtn = (x, y, buttonImg, cost, onClick) => {
      const btn = this.add.image(x, y, buttonImg).setOrigin(0, 0);
      btn.setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!this.state) return;
          if (this.state.gold >= cost) {
            this.state.gold -= cost;
            onClick();
            this.updateUI();
          }
        });
      this.shop.add(btn);
      return btn;
    };

    // Rozmieszczenie 4 przycisków na menu_background
    // Współrzędne do dostosowania w zależności od rozmiaru grafiki
    const btnSpacing = 180; // Odstęp między przyciskami (3x większy: 60 * 3 = 180)
    const btnStartY = -700; // Jeszcze wyżej od dolnej krawędzi
    
    mkBtn(40, btnStartY, 'button3', 25, () => this.state.upgrades.movement = +(this.state.upgrades.movement + 0.30).toFixed(2));
    mkBtn(40, btnStartY + btnSpacing, 'button2', 40, () => this.state.upgrades.fireRate = +(this.state.upgrades.fireRate + 0.4).toFixed(2));
    mkBtn(40, btnStartY + btnSpacing * 2, 'button4', 35, () => this.state.upgrades.damage = +(this.state.upgrades.damage + 0.25).toFixed(2));
    mkBtn(40, btnStartY + btnSpacing * 3, 'button1', 50, () => this.state.upgrades.armor += 0.5);

    // NOWE: Kontener i tekst dla bonusów (Prawy Dół) – grafika template_right + Pixelify Sans
    this.bonusContainer = this.add.container(W - 300, H - 200).setDepth(50).setVisible(false);
    this.bonusBg = this.add.image(0, 0, 'template_right').setOrigin(0, 0);
    // Skalowanie tła na 1.25
    this.bonusBg.setScale(1.25);
    // Tekst wyśrodkowany na grafice
    this.bonusText = this.add.text(0, 0, '', { fontSize: 18, color: '#000000', fontFamily: 'Pixelify Sans, monospace' }).setOrigin(0.5, 0.5);
    this.bonusTimerText = this.add.text(12, 28, '', { fontSize: 14, color: '#000000', fontFamily: 'Pixelify Sans, monospace' });
    this.bonusContainer.add([this.bonusBg, this.bonusText, this.bonusTimerText]);
    
    // Wyśrodkuj tekst na grafice (po utworzeniu, displayWidth i displayHeight uwzględniają skalę)
    this.time.delayedCall(0, () => {
      if (this.bonusBg && this.bonusText) {
        this.bonusText.x = this.bonusBg.displayWidth / 2;
        this.bonusText.y = this.bonusBg.displayHeight / 2;
      }
    });

    // Globalne eventy z gry
    this.game.events.on('updateUI', this.updateUI, this);
    this.game.events.on('toggleShop', () => this.shop.setVisible(!this.shop.visible), this);
    this.game.events.on('gameOver', this.showGameOver, this);
    this.game.events.on('bonusGranted', this.showBonusMessage, this); // NOWE: Obsługa komunikatu o bonusie

    // Obsługa klawisza U bezpośrednio w UI – bardziej niezawodne (fokus, restart itp.)
    this.input.keyboard.on('keydown-U', () => {
      this.shop.setVisible(!this.shop.visible);
    });

    this.updateUI();
  }

  updateUI() {
    if (!this.state) return;
    this.scoreText.setText(`Punkty: ${this.state.score}   Poziom: ${this.state.level}`);
    this.goldText.setText(`Złoto: ${this.state.gold}`);
    const hp = typeof this.state.hp === 'number' ? this.state.hp : 100;
    const maxHp = typeof this.state.maxHp === 'number' ? this.state.maxHp : 100;
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this.hpBar.width = 216 * ratio;
    this.hpBar.fillColor = (ratio > 0.5) ? 0x59d66f : (ratio > 0.25 ? 0xffcc66 : 0xff6b6b);

    // NOWE: Aktualizacja wskaźnika nieśmiertelności
    if (this.state.isInvincible) {
      const secs = Math.max(0, this.state.invincibilityDuration);
      this.bonusText.setText(`NIEŚMIERTELNOŚĆ: ${secs}s`);
      this.bonusTimerText.setVisible(false);
      this.bonusContainer.setVisible(true);
    } else {
      this.bonusContainer.setVisible(false);
    }
  }

  showBonusMessage(data) {
    if (data.type === 'invincibility') {
      const secs = Math.max(0, this.state?.invincibilityDuration ?? 0);
      this.bonusText.setText(`nieśmiertelność: ${secs}s`);
      this.bonusContainer.setVisible(true);
    }
    // Własny timer w updateUI zajmuje się odliczaniem
  }

  showGameOver() {
    this.add.rectangle(W / 2, H / 2, 420, 200, 0x0d1b2a, 0.93).setDepth(20).setStrokeStyle(2, 0x456);
    this.add.text(W / 2, H / 2 - 40, 'KONIEC REJSU', { fontSize: 28, color: '#ffd36e' }).setOrigin(0.5).setDepth(21).setFontFamily('Silkscreen, monospace');
    this.add.text(W / 2, H / 2 + 10, `Wynik: ${this.state.score}  |  Poziom: ${this.state.level}`, { fontSize: 18, color: '#cde1ff' }).setOrigin(0.5).setDepth(21).setFontFamily('Silkscreen, monospace');
    this.add.text(W / 2, H / 2 + 50, 'R – zagraj ponownie', { fontSize: 16, color: '#b9d3ff' }).setOrigin(0.5).setDepth(21).setFontFamily('Silkscreen, monospace');
  }
}

// =============================
// KONFIGURACJA I START GRY
// =============================
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: W,
  height: H,
  pixelArt: true,
  roundPixels: true,
  input: { keyboard: true, mouse: true, touch: true, gamepad: false },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

// Zapewnij fokus canvasowi (ważne dla klawiatury)
window.addEventListener('load', () => {
  if (game && game.canvas) {
    game.canvas.setAttribute('tabindex', '0');
    game.canvas.focus();
  }
});
