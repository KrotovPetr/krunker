import {
  WEAPONS,
  CLASS_NAMES,
  reserveAmmo,
  FIREARMS,
  equippedWeapon,
  magazineAmmo,
  getMap,
} from '@fps/game-core';
import type { GameSnapshot, PlayerSnapshot, ServerEvent } from '@fps/protocol';

const el = (id: string) => document.getElementById(id)!;
export function createGameUI() {
  let scoreKey = '';
  let current: GameSnapshot | undefined;
  let local: PlayerSnapshot | undefined;
  let hitUntil = 0;
  let hurtUntil = 0;
  let practiceHitUntil = 0;
  const feed: { text: string; expires: number }[] = [];
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
        el('health-fill').style.width =
          `${Math.max(0, (local.health / local.maxHealth) * 100)}%`;
        el('health-fill').classList.toggle(
          'critical',
          local.health < local.maxHealth * 0.3,
        );
        el('reload-fill').style.width =
          local.reloadRemaining > 0
            ? `${100 * (1 - local.reloadRemaining / FIREARMS[equipped].reload)}%`
            : '0%';
        el('weapon-description').textContent =
          `${CLASS_NAMES[local.weapon]} · ${WEAPONS[local.weapon].health} HP · ${WEAPONS[local.weapon].speed.toFixed(2)}× скорость · ${WEAPONS[local.weapon].magazine} патронов · ${Math.round(60 / WEAPONS[local.weapon].interval)} выстр./мин · ${WEAPONS[local.weapon].damage} базовый урон`;
        el('ammo').classList.toggle(
          'low-ammo',
          magazineAmmo(local) <= 3 && !local.reloadRemaining,
        );
        el('health').textContent =
          `${Math.ceil(local.health)} / ${local.maxHealth} HP`;
        el('ammo').textContent =
          local.reloadRemaining > 0
            ? `Перезарядка ${local.reloadRemaining.toFixed(1)} с`
            : `${magazineAmmo(local)} / ${FIREARMS[equipped].magazine}`;
        el('weapon-name').textContent = FIREARMS[equipped].name;
        el('ammo-reserve').textContent = 'ЗАПАС ' + reserveAmmo(local);
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
        select.value = local.weapon;
        select.disabled =
          snapshot.phase === 'active' &&
          local.ready &&
          local.health > 0 &&
          !(snapshot.mode === 'waves' && snapshot.wave.status === 'preparing');
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
          el('wave-hud').dataset.status = w.status;
          el('wave-hud').dataset.number = String(w.number);
          el('wave-hud').dataset.enemies = String(w.alive + w.queued);
          el('wave-number').textContent = `ВОЛНА ${Math.max(1, w.number)}`;
          el('wave-state').textContent =
            w.status === 'preparing'
              ? `Подготовка · ${Math.ceil(w.remaining)} с`
              : w.status === 'fighting'
                ? `Осталось ${w.alive + w.queued} · На карте ${w.alive}`
                : w.status === 'defeat'
                  ? `Оборона прорвана · Волн отражено: ${w.cleared}`
                  : 'Нажми «Выйти на арену», чтобы начать';
          el('wave-progress-fill').style.width =
            `${w.total ? ((w.total - w.alive - w.queued) / w.total) * 100 : 0}%`;
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
      while (feed[0] && feed[0].expires <= now) feed.shift();
      el('kill-feed').textContent = feed.map((item) => item.text).join('\n');
    },
    event(event: ServerEvent, localId: string) {
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
        feed.push({
          text: `${event.attacker} → ${event.victim} · ${event.weapon === 'knife' ? 'Нож' : FIREARMS[event.weapon].name}`,
          expires: performance.now() + 5000,
        });
        if (feed.length > 5) feed.shift();
      }
      if (event.type === 'roundStart') {
        feed.length = 0;
        pinned = false;
      }
    },
    reset() {
      scoreKey = '';
      current = undefined;
      local = undefined;
      feed.length = 0;
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
      el('movement-hud').classList.remove('shielded');
      el('match-time').textContent = '';
      el('death-message').hidden = true;
    },
  };
}
