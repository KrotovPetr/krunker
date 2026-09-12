import {
  WEAPONS,
  CLASS_NAMES,
  roleForWeapon,
  challengeActive,
  reserveAmmo,
  FIREARMS,
  equippedWeapon,
  equippedFirearm,
  equipmentAllowed,
  magazineAmmo,
  getMap,
  MOVEMENT,
  CONTROL,
} from '@fps/game-core';
import { isTeamMode } from '@fps/protocol';
import type {
  GameSnapshot,
  PlayerSnapshot,
  ServerEvent,
  WeaponId,
} from '@fps/protocol';
import { createKillFeedItem, type KillFeedItem } from './kill-feed.js';
import { summarizeEnemyWave, type EnemyWaveSummary } from './enemy-roster.js';

const CLASS_DESCRIPTIONS: Record<WeaponId, [string, string]> = {
  sapper: [
    'Карабин для средней дистанции. G ставит мину перед ногами. Взведение 1,2 с, установка каждые 12 с, максимум две мины.',
    'Карабин уступает автомату в прямой перестрелке. Мины видны и уничтожаются выстрелом; живут 40 с или до твоей гибели. В обороне союзники защищены.',
  ],
  rifle: [
    'Универсальный боец для средней дистанции. Автомат хорош для коротких очередей и смены позиций.',
    'При долгом зажатии растёт разброс. До боя можно заменить автомат дробовиком — второго основного оружия нет.',
  ],
  smg: [
    'Самый быстрый класс. Обходи противника и сближайся: ПП выпускает быстрые очереди.',
    'На 12% быстрее штурмовика. После 8 м урон снижается, предел дальности ПП — 40 м. Избегай открытых прострелов.',
  ],
  sniper: [
    'Контроль дальних проходов и мощные одиночные выстрелы. Оптика на Q / ПКМ; от бедра тоже точно в перекрестие.',
    '85 урона в корпус, 170 в голову. Промах или попадание в корпус требуют второго выстрела; всего 5 патронов.',
  ],
  shotgun: [
    'Ближний бой: один выстрел выпускает 8 дробин. Заходи с фланга и используй узкие проходы.',
    'Снаряжение штурмовика вместо автомата. Те же 100 HP и скорость; на дистанции дробь рассеивается и быстро теряет урон.',
  ],
  revolver: [
    'Точные одиночные выстрелы с высоким уроном. Подходит для быстрых выходов из укрытия.',
    'Всего 6 патронов: промахи оставляют противнику время для ответа.',
  ],
  lmg: [
    'Прикрытие и удержание проходов. 100 патронов: остановись и прицелься для точного огня.',
    'На 18% медленнее штурмовика. На ходу и от бедра большой разброс, длинная очередь снижает точность. Перезарядка 6 секунд.',
  ],
};

const el = (id: string) => document.getElementById(id)!;

function text(className: string, value: string) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = value;
  return node;
}

function renderKillFeed(items: readonly KillFeedItem[]) {
  el('kill-feed').replaceChildren(
    ...items.map((item) => {
      const row = document.createElement('div');
      row.className = 'kill-feed-row';
      row.classList.toggle('local-kill', item.localKill);
      row.classList.toggle('local-death', item.localDeath);
      row.setAttribute('aria-label', item.announcement);

      const line = document.createElement('div');
      line.className = 'kill-feed-line';
      line.append(
        text('kill-feed-attacker', item.attacker),
        text('kill-feed-weapon', item.weaponLabel),
        text('kill-feed-victim', item.victim),
      );
      const weapon = line.children[1] as HTMLElement;
      weapon.dataset.weapon = item.weapon;
      weapon.title = item.weaponName;

      const tags = document.createElement('div');
      tags.className = 'kill-feed-tags';
      tags.append(
        ...item.tags.map((tag) => text(`kill-tag ${tag.kind}`, tag.label)),
      );
      row.append(line, tags);
      return row;
    }),
  );
}

function renderEnemyRoster(summary: EnemyWaveSummary) {
  const roster = el('wave-enemy-roster');
  if (!summary.classes.length) {
    roster.replaceChildren();
    roster.setAttribute(
      'aria-label',
      summary.queued
        ? `На поле нет врагов, подходят: ${summary.queued}`
        : 'На поле нет врагов',
    );
    return;
  }
  roster.replaceChildren(
    ...summary.classes.map((enemyClass) => {
      const chip = document.createElement('span');
      chip.className = 'enemy-class';
      chip.dataset.weapon = enemyClass.weapon;
      chip.title = CLASS_NAMES[enemyClass.weapon];
      chip.append(
        text('enemy-class-name', enemyClass.label),
        text('enemy-class-count', `×${enemyClass.count}`),
      );
      return chip;
    }),
  );
  roster.setAttribute(
    'aria-label',
    summary.classes
      .map(
        (enemyClass) =>
          `${CLASS_NAMES[enemyClass.weapon]}: ${enemyClass.count}`,
      )
      .join(', '),
  );
}

export function createGameUI() {
  let scoreKey = '';
  let enemyRosterKey = '';
  let displayedClass: WeaponId | undefined;
  let current: GameSnapshot | undefined;
  let local: PlayerSnapshot | undefined;
  let hitUntil = 0;
  let hurtUntil = 0;
  let practiceHitUntil = 0;
  const feed: KillFeedItem[] = [];
  let pinned = false;
  let dismissedResults = false;
  let damageUntil = 0,
    damage = 0,
    damageTarget = '',
    supplyUntil = 0;
  let killUntil = 0,
    directionUntil = 0,
    hurtAngle = 0;
  el('scores').addEventListener('click', () => {
    pinned = !pinned;
  });
  el('close-scores').addEventListener('click', () => {
    pinned = false;
    dismissedResults = true;
  });
  return {
    snapshot(snapshot: GameSnapshot, localId: string) {
      if (snapshot.phase !== current?.phase) dismissedResults = false;
      current = snapshot;
      el('app').dataset.mode = snapshot.mode;
      local = snapshot.players.find((p) => p.id === localId);
      const point = getMap(snapshot.mapId).control;
      const capture = snapshot.control;
      el('control-hud').hidden = snapshot.mode !== 'control';
      if (snapshot.mode === 'control' && capture && point) {
        el('control-hud').dataset.owner = capture.owner;
        el('control-hud').dataset.contested = String(capture.contested);
        el('control-hud').dataset.score = String(Math.floor(capture.allyScore));
        el('control-score').textContent =
          `ОТРЯД ${Math.floor(capture.allyScore)} : ${Math.floor(capture.enemyScore)} ПРОТИВНИКИ · до ${CONTROL.scoreToWin}`;
        const distance = local
          ? Math.hypot(
              local.position.x - point.position.x,
              local.position.z - point.position.z,
            )
          : 0;
        el('control-state').textContent =
          snapshot.phase === 'waiting'
            ? 'Нажми «Выйти на арену»'
            : snapshot.phase === 'results'
              ? `Итог: ${snapshot.winner}`
              : `A · Под галереей · ${Math.round(distance)} м · ${capture.contested ? 'ОСПАРИВАЕТСЯ' : capture.allies && capture.progress < 1 ? 'ЗАХВАТ ОТРЯДА' : capture.enemies && capture.progress > -1 ? 'ЗАХВАТ ПРОТИВНИКА' : capture.owner === 'allies' ? 'НАША ТОЧКА' : capture.owner === 'enemies' ? 'ТОЧКА ПРОТИВНИКА' : 'НЕЙТРАЛЬНАЯ'}`;
        (el('control-progress') as HTMLProgressElement).value = Math.abs(
          capture.progress,
        );
      }
      el('squad-command-hud').hidden = !isTeamMode(snapshot.mode);
      if (isTeamMode(snapshot.mode)) {
        const order = snapshot.squadOrder;
        const commander = snapshot.players.find(
          (p) => p.id === order?.commanderId,
        );
        const allies = snapshot.players.filter((p) => p.ally);
        const label =
          order?.kind === 'follow'
            ? 'За командиром'
            : order?.kind === 'hold'
              ? 'Удерживать позицию'
              : order?.kind === 'attack'
                ? snapshot.mode === 'mission'
                  ? 'К заданию'
                  : 'К точке A'
                : snapshot.mode === 'control'
                  ? 'К точке A автоматически'
                  : snapshot.mode === 'mission'
                    ? 'Прикрываем задание'
                    : 'Самостоятельные действия';
        el('squad-command-hud').dataset.order = order?.kind ?? 'auto';
        el('squad-order-state').textContent = allies.length
          ? `${label}${commander && order ? ` · ${commander.nickname} · ${Math.ceil(order.remaining)} с` : ''}`
          : 'Нет союзных ботов · добавь их в меню';
        el('squad-order-help').textContent =
          `Z · за мной   X · держать место под прицелом${snapshot.mode === 'mission' ? '   T · к заданию' : snapshot.mode === 'control' ? '   T · к точке' : ''}`;
      }
      const seconds = Math.ceil(snapshot.remaining);
      el('match-time').textContent =
        snapshot.phase === 'waiting'
          ? snapshot.mapId !== 'switchyard'
            ? `${getMap(snapshot.mapId).name} · Разминка · Матч, когда готовы двое`
            : 'Пристрелочный полигон · Матч, когда готовы двое'
          : snapshot.phase === 'results'
            ? `Следующий раунд через ${seconds}`
            : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · Раунд ${snapshot.round}`;
      el('match-time').dataset.phase = snapshot.phase;
      el('match-time').dataset.round = String(snapshot.round);
      el('score-title').textContent =
        snapshot.phase === 'results'
          ? snapshot.winner === 'Ничья'
            ? 'Ничья'
            : `Победитель: ${snapshot.winner}`
          : `Таблица · Раунд ${snapshot.round}`;
      const rows = snapshot.players
        .filter((p) => snapshot.mode !== 'waves' || !p.bot || p.ally)
        .sort(
          (a, b) =>
            b.kills - a.kills ||
            a.deaths - b.deaths ||
            a.nickname.localeCompare(b.nickname),
        );
      const nextScoreKey = JSON.stringify([
        localId,
        rows.map((p) => [
          p.id,
          p.nickname,
          p.connected,
          p.ready,
          p.weapon,
          p.kills,
          p.deaths,
        ]),
      ]);
      if (nextScoreKey !== scoreKey) {
        scoreKey = nextScoreKey;
        el('score-rows').replaceChildren(
          ...rows.map((player) => {
            const row = document.createElement('tr');
            if (player.id === localId) row.className = 'self';
            for (const value of [
              player.nickname +
                (!player.connected
                  ? ' · связь…'
                  : !player.ready
                    ? ' · в меню'
                    : ''),
              WEAPONS[player.weapon].name,
              player.kills,
              player.deaths,
            ]) {
              const cell = document.createElement('td');
              cell.textContent = String(value);
              row.append(cell);
            }
            return row;
          }),
        );
      }
      if (local) {
        const equipped = equippedWeapon(local);
        const gun = FIREARMS[equippedFirearm(local)];
        const melee = equipped === 'knife';
        el('health-fill').style.width =
          `${Math.max(0, (local.health / local.maxHealth) * 100)}%`;
        el('health-fill').classList.toggle(
          'critical',
          local.health < local.maxHealth * 0.3,
        );
        el('reload-fill').style.width =
          local.reloadRemaining > 0
            ? `${100 * (1 - local.reloadRemaining / gun.reload)}%`
            : '0%';
        if (displayedClass !== local.weapon) {
          displayedClass = local.weapon;
          const config = WEAPONS[local.weapon];
          el('class-name').textContent = CLASS_NAMES[local.weapon];
          el('weapon-description').textContent =
            CLASS_DESCRIPTIONS[local.weapon][0];
          el('class-tradeoff').textContent =
            CLASS_DESCRIPTIONS[local.weapon][1];
          el('class-health').textContent = `${config.health} HP`;
          el('class-speed').textContent =
            `${(MOVEMENT.walkSpeed * config.speed).toFixed(1)} м/с`;
          el('class-ammo').textContent =
            `${config.magazine} + ${config.magazine * 3}`;
          el('class-reload').textContent = `${config.reload} с`;
          el('class-rate').textContent =
            `${Math.round(60 / config.interval)} / мин`;
          el('class-damage').textContent =
            config.pellets > 1
              ? `${config.damage} × ${config.pellets} дробин`
              : String(config.damage);
        }
        el('ammo').classList.toggle(
          'low-ammo',
          !melee && magazineAmmo(local) <= 3 && !local.reloadRemaining,
        );
        el('health').textContent =
          `${Math.ceil(local.health)} / ${local.maxHealth} HP`;
        el('ammo').textContent = melee
          ? 'ЛКМ · УДАР'
          : local.reloadRemaining > 0
            ? `Перезарядка ${local.reloadRemaining.toFixed(1)} с`
            : `${magazineAmmo(local)} / ${gun.magazine}`;
        el('weapon-name').textContent = melee ? 'Нож' : gun.name;
        el('weapon-name').dataset.slot = local.slot;
        el('ammo-reserve').textContent = melee
          ? '1 / 2 · СМЕНИТЬ ОРУЖИЕ'
          : 'ЗАПАС ' + reserveAmmo(local);
        const mineHud = el('mine-hud');
        const grenadeHud = el('grenade-hud');
        grenadeHud.dataset.count = String(local.grenades);
        const usable = equipmentAllowed(snapshot, local);
        grenadeHud.textContent = `B · ГРАНАТА ${local.grenades}/1${!usable ? ' · сейчас недоступна' : local.grenades === 0 ? (snapshot.phase === 'waiting' || snapshot.mode === 'training' ? ' · пополнение после взрыва' : ' · после возрождения') : ''}`;
        el('health-kit-hud').textContent =
          local.healthCooldown > 0
            ? `Аптечка · ${Math.ceil(local.healthCooldown)} с`
            : 'Аптечка · +35 HP';
        mineHud.hidden = local.weapon !== 'sapper';
        const mineCount = snapshot.mines.filter(
          (m) => m.ownerId === localId,
        ).length;
        mineHud.dataset.count = String(mineCount);
        mineHud.dataset.cooldown = String(Math.ceil(local.mineCooldown));
        mineHud.textContent = `G · МИНА ${mineCount}/2 · ${!usable ? 'сейчас недоступна' : mineCount >= 2 ? 'лимит на карте' : local.mineCooldown > 0 ? `${Math.ceil(local.mineCooldown)} с` : !local.grounded ? 'приземлись' : 'готова'}`;
        el('weapon-slots').textContent =
          `1 · ${WEAPONS[local.weapon].name} ${local.ammo}   2 · Пистолет ${local.secondaryAmmo}   V · Нож`;
        el('ammo').dataset.slot = local.slot;
        el('personal-score').textContent =
          `${local.kills} убийств · ${local.deaths} смертей`;
        el('death-message').hidden =
          local.health > 0 || snapshot.phase !== 'active';
        el('death-message').textContent =
          `Возрождение через ${Math.ceil(local.respawnRemaining)} с · Esc — выбрать класс`;
        el('protection').textContent =
          snapshot.phase === 'active' &&
          local.protectionRemaining > 0 &&
          local.health > 0
            ? `ЩИТ · ${local.protectionRemaining.toFixed(1)} с`
            : '';
        const select = el('weapon-select') as HTMLSelectElement;
        const role = roleForWeapon(local.weapon);
        select.value = role?.weapons[0] ?? 'rifle';
        select.disabled =
          challengeActive(local.challenge) ||
          (snapshot.phase === 'active' &&
            local.ready &&
            local.health > 0 &&
            !(
              snapshot.mode === 'waves' && snapshot.wave.status === 'preparing'
            ));
        el('assault-loadout-row').hidden = role?.id !== 'assault';
        const loadout = el('assault-loadout') as HTMLSelectElement;
        loadout.value = local.weapon === 'shotgun' ? 'shotgun' : 'rifle';
        loadout.disabled = select.disabled;
        el('ready').textContent = local.ready
          ? 'Готов к матчу ✓'
          : 'Готов к матчу';
        (el('ready') as HTMLButtonElement).disabled = local.ready;
        el('health').dataset.value = String(local.health);
        el('health').dataset.life = String(local.lifeId);
        el('protection').dataset.remaining = String(local.protectionRemaining);
        el('movement-hud').classList.toggle(
          'shielded',
          snapshot.phase === 'active' &&
            local.health > 0 &&
            local.protectionRemaining > 0,
        );
        el('wave-hud').hidden = snapshot.mode !== 'waves';
        if (snapshot.mode === 'waves') {
          const w = snapshot.wave;
          const enemies = summarizeEnemyWave(snapshot.players, w);
          el('wave-hud').dataset.status = w.status;
          el('wave-hud').dataset.number = String(w.number);
          el('wave-hud').dataset.enemies = String(enemies.remaining);
          el('wave-hud').dataset.active = String(enemies.active);
          el('wave-hud').dataset.queued = String(enemies.queued);
          el('wave-hud').dataset.defeated = String(enemies.defeated);
          el('wave-number').textContent = `ВОЛНА ${Math.max(1, w.number)}`;
          el('wave-enemy-count').textContent = String(enemies.remaining);
          el('wave-active-count').textContent = String(enemies.active);
          el('wave-queued-count').textContent = String(enemies.queued);
          el('wave-defeated-count').textContent = String(enemies.defeated);
          const nextEnemyRosterKey = JSON.stringify([
            enemies.queued,
            enemies.classes,
          ]);
          if (nextEnemyRosterKey !== enemyRosterKey) {
            enemyRosterKey = nextEnemyRosterKey;
            renderEnemyRoster(enemies);
          }
          el('wave-state').textContent =
            w.status === 'preparing'
              ? `Подготовка · ${Math.ceil(w.remaining)} с`
              : w.status === 'fighting'
                ? enemies.remaining === 1
                  ? 'Последний противник'
                  : enemies.queued
                    ? 'Подкрепление входит на карту'
                    : 'Все противники на поле'
                : w.status === 'defeat'
                  ? `Оборона прорвана · Волн отражено: ${w.cleared}`
                  : 'Нажми «Выйти на арену», чтобы начать';
          el('wave-progress-fill').style.width =
            `${w.total ? (enemies.defeated / w.total) * 100 : 0}%`;
          const team = snapshot.players.filter(
            (p) => (!p.bot || p.ally) && p.ready,
          );
          el('wave-team').textContent =
            `Защитники ${team.filter((p) => p.health > 0 && p.connected).length}/${team.length} · Вражеские входы на миникарте`;
          el('match-time').textContent =
            w.status === 'defeat'
              ? 'Esc · Ещё попытка'
              : 'ОБОРОНА · СОЮЗНЫЙ ОГОНЬ ВЫКЛЮЧЕН';
          el('death-message').hidden = local.health > 0 || !local.ready;
          el('death-message').textContent =
            w.status === 'defeat'
              ? snapshot.hostId === localId
                ? 'Оборона прорвана · R — ещё попытка'
                : 'Оборона прорвана · Ждём новую попытку'
              : 'Ты вернёшься перед следующей волной · Esc — выбрать оружие';
          el('score-title').textContent =
            w.status === 'defeat'
              ? `Оборона закончена · ${w.cleared} волн`
              : `Оборона · Волна ${w.number}`;
          el('ready').textContent = local.ready
            ? 'Защитник ✓'
            : 'Готов защищать';
        }
        if (snapshot.mode !== 'waves') enemyRosterKey = '';
      }
    },
    frame(
      showScores: boolean,
      aiming: boolean,
      locked: boolean,
      yaw = local?.yaw ?? 0,
    ) {
      const now = performance.now();
      el('scoreboard').hidden = !(
        showScores ||
        pinned ||
        (current?.phase === 'results' &&
          current.mode !== 'waves' &&
          current.mode !== 'mission' &&
          !dismissedResults)
      );
      const scoped =
        locked &&
        aiming &&
        local?.weapon === 'sniper' &&
        local.slot === 'primary' &&
        local.reloadRemaining <= 0 &&
        local.health > 0 &&
        current?.phase !== 'results';
      el('scope').hidden = !scoped;
      el('crosshair').hidden = scoped;
      el('practice-hit').hidden =
        now > practiceHitUntil || current?.phase !== 'waiting';
      el('hitmarker').hidden = now > hitUntil;
      el('hurt').hidden = now > hurtUntil;
      el('kill-confirm').hidden = true;
      el('hitmarker').classList.toggle('elimination', now < killUntil);
      el('damage-number').hidden = now > damageUntil;
      el('supply-notice').hidden = now > supplyUntil;
      el('damage-direction').hidden = now > directionUntil;
      el('damage-direction').style.transform =
        `translate(-50%, -50%) rotate(${hurtAngle + yaw}rad) translateY(-85px)`;
      let feedChanged = false;
      while (feed[0] && feed[0].expires <= now) {
        feed.shift();
        feedChanged = true;
      }
      if (feedChanged) renderKillFeed(feed);
    },
    event(event: ServerEvent, localId: string) {
      if (
        event.type === 'commandRejected' &&
        (event.reason === 'invalidOrder' || event.reason === 'orderCooldown') &&
        (!('playerId' in event) || event.playerId === localId)
      ) {
        supplyUntil = performance.now() + 2800;
        el('supply-notice').textContent =
          event.reason === 'orderCooldown'
            ? 'Подожди секунду перед следующим приказом'
            : 'Приказ не принят. Нужны живой командир и союзные боты; для X прицелься в доступный пол в пределах 35 м.';
      }
      if (event.type === 'equipmentRejected' && event.playerId === localId) {
        const reasons = {
          unavailable:
            'Недоступно во время испытания, после смерти или вне игры',
          sapperOnly: 'Мины доступны только инженеру',
          airborne: 'Для установки мины нужно стоять на земле',
          cooldown: 'Мина ещё не готова. Дождись отсчёта в HUD',
          empty:
            'Гранат нет. Пополнение при возрождении, в разминке после взрыва',
          limit: 'Можно поставить только две мины одновременно',
          reload: 'Сначала закончи перезарядку',
          blocked: 'Мало места. Отойди от стены или края и попробуй ещё раз',
        };
        supplyUntil = performance.now() + 2800;
        el('supply-notice').textContent = reasons[event.reason];
      }
      if (event.type === 'healed' && event.playerId === localId) {
        supplyUntil = performance.now() + 1600;
        el('supply-notice').textContent = `Здоровье +${event.amount}`;
      }
      if (event.type === 'resupply' && event.playerId === localId) {
        supplyUntil = performance.now() + 1600;
        el('supply-notice').textContent = 'Боезапас пополнен';
      }
      if (
        (event.type === 'hit' || event.type === 'practiceHit') &&
        event.playerId === localId
      ) {
        const now = performance.now();
        damage =
          now < damageUntil && damageTarget === event.targetId
            ? damage + event.damage
            : event.damage;
        damageTarget = event.targetId;
        damageUntil = now + 650;
        el('damage-number').textContent = String(Math.round(damage));
        el('damage-number').classList.toggle('headshot', event.headshot);
      }
      if (event.type === 'practiceHit' && event.playerId === localId) {
        hitUntil = performance.now() + 150;
        practiceHitUntil = performance.now() + 1800;
        el('practice-hit').textContent =
          `${event.headshot ? 'Голова' : 'Попадание'} · ${Math.round(event.damage)} урона`;
      }
      if (event.type === 'hit') {
        if (event.playerId === localId) {
          hitUntil = performance.now() + 180;
          el('hitmarker').classList.toggle('headshot', event.headshot);
        }
        if (event.targetId === localId) {
          hurtUntil = performance.now() + 220;
          directionUntil = performance.now() + 1300;
          const attacker = current?.players.find(
            (p) => p.id === event.playerId,
          );
          if (attacker && local)
            hurtAngle = Math.atan2(
              attacker.position.x - local.position.x,
              -(attacker.position.z - local.position.z),
            );
        }
      }
      if (event.type === 'kill') {
        if (event.playerId === localId) {
          killUntil = performance.now() + 400;
          hitUntil = killUntil;
          el('kill-confirm').textContent = `ЦЕЛЬ УСТРАНЕНА · ${event.victim}`;
        }
        feed.push(createKillFeedItem(event, localId, performance.now() + 6000));
        if (feed.length > 5) feed.shift();
        renderKillFeed(feed);
      }
      if (event.type === 'roundStart') {
        feed.length = 0;
        renderKillFeed(feed);
        pinned = false;
      }
    },
    reset() {
      scoreKey = '';
      enemyRosterKey = '';
      current = undefined;
      local = undefined;
      feed.length = 0;
      renderKillFeed(feed);
      el('wave-enemy-roster').replaceChildren();
      pinned = false;
      dismissedResults = false;
      killUntil =
        directionUntil =
        damageUntil =
        supplyUntil =
        hitUntil =
        hurtUntil =
        practiceHitUntil =
          0;
      el('wave-hud').hidden = true;
      el('control-hud').hidden = true;
      el('squad-command-hud').hidden = true;
      el('movement-hud').classList.remove('shielded');
      el('match-time').textContent = '';
      el('death-message').hidden = true;
    },
  };
}
