import type {
  GameSnapshot,
  PlayerSnapshot,
  ServerEvent,
  Vec3,
} from '@fps/protocol';
import { equippedWeapon } from '@fps/game-core';

// Original synthesized sounds. One context, one reusable noise buffer, bounded voices.
export function createSound() {
  let context: AudioContext | undefined,
    master: GainNode | undefined,
    noise: AudioBuffer | undefined;
  let volume = 0.35,
    active = false,
    disposed = false;
  let listener: PlayerSnapshot | undefined;
  const voices = new Set<AudioBufferSourceNode | OscillatorNode>();
  const previous = new Map<
    string,
    { player: PlayerSnapshot; distance: number }
  >();
  try {
    const stored = localStorage.getItem('fps.volume');
    if (stored !== null) volume = Math.max(0, Math.min(1, Number(stored) || 0));
  } catch {
    /* optional */
  }
  function envelope(duration: number, gain: number, position?: Vec3) {
    if (
      !context ||
      !master ||
      !active ||
      context.state !== 'running' ||
      voices.size >= 32 ||
      volume === 0
    )
      return;
    const now = context.currentTime;
    let attenuation = 1,
      pan = 0;
    if (position && listener) {
      const dx = position.x - listener.position.x,
        dz = position.z - listener.position.z;
      const distance = Math.hypot(dx, position.y - listener.position.y, dz);
      if (distance > 65) return;
      attenuation = 1 / (1 + (distance * distance) / 100);
      pan = Math.max(
        -0.95,
        Math.min(
          0.95,
          (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) /
            Math.max(1, distance),
        ),
      );
    }
    const amp = context.createGain(),
      stereo = context.createStereoPanner();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gain * attenuation),
      now + 0.003,
    );
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    stereo.pan.value = pan;
    amp.connect(stereo);
    stereo.connect(master);
    return {
      context,
      amp,
      now,
      finish(
        source: AudioBufferSourceNode | OscillatorNode,
        extra?: AudioNode,
      ) {
        voices.add(source);
        source.onended = () => {
          voices.delete(source);
          source.disconnect();
          extra?.disconnect();
          amp.disconnect();
          stereo.disconnect();
        };
        source.start(now);
        source.stop(now + duration + 0.02);
      },
    };
  }
  function tone(
    frequency: number,
    end: number,
    duration: number,
    gain: number,
    position?: Vec3,
  ) {
    const voice = envelope(duration, gain, position);
    if (!voice) return;
    const oscillator = voice.context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, voice.now);
    oscillator.frequency.exponentialRampToValueAtTime(
      end,
      voice.now + duration,
    );
    oscillator.connect(voice.amp);
    voice.finish(oscillator);
  }
  function burst(
    duration: number,
    frequency: number,
    gain: number,
    position?: Vec3,
  ) {
    const voice = envelope(duration, gain, position);
    if (!voice || !noise) return;
    const source = voice.context.createBufferSource(),
      filter = voice.context.createBiquadFilter();
    source.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    source.connect(filter);
    filter.connect(voice.amp);
    voice.finish(source, filter);
  }
  const shot = (weapon: string, position?: Vec3) => {
    const heavy =
      weapon === 'sniper' || weapon === 'shotgun' || weapon === 'revolver';
    if (weapon === 'knife') {
      burst(0.12, 2200, 0.17, position);
      return;
    }
    burst(
      heavy ? 0.22 : 0.11,
      weapon === 'pistol'
        ? 2400
        : weapon === 'smg'
          ? 4100
          : weapon === 'revolver'
            ? 1900
            : heavy
              ? 1400
              : 3300,
      heavy ? 0.6 : 0.35,
      position,
    );
    tone(heavy ? 155 : 260, 45, heavy ? 0.2 : 0.09, 0.25, position);
  };
  return {
    get volume() {
      return volume;
    },
    async unlock() {
      if (disposed) return;
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = volume;
          master.connect(context.destination);
          noise = context.createBuffer(
            1,
            context.sampleRate,
            context.sampleRate,
          );
          const data = noise.getChannelData(0);
          let seed = 12345;
          for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            data[i] = seed / 0x80000000 - 1;
          }
        }
        await context.resume();
      } catch {
        /* Gameplay remains available without an audio device. */
      }
    },
    setVolume(value: number) {
      if (!Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(1, value));
      if (master && context)
        master.gain.setTargetAtTime(volume, context.currentTime, 0.03);
      try {
        localStorage.setItem('fps.volume', String(volume));
      } catch {
        /* optional */
      }
    },
    setActive(enabled: boolean) {
      active = enabled;
      if (!enabled)
        for (const source of voices) {
          try {
            source.stop();
          } catch {
            /* already stopped */
          }
        }
    },
    shot,
    event(event: ServerEvent, localId: string) {
      if (event.type === 'shot' && event.playerId !== localId)
        shot(event.weapon, event.origin);
      if (
        (event.type === 'hit' || event.type === 'practiceHit') &&
        event.playerId === localId
      )
        tone(event.headshot ? 1400 : 900, 600, 0.06, 0.15);
      if (event.type === 'kill' && event.targetId === localId)
        tone(180, 35, 0.4, 0.35);
      if (event.type === 'roundStart') tone(420, 840, 0.22, 0.15);
    },
    update(snapshot: GameSnapshot, localId: string) {
      listener = snapshot.players.find((p) => p.id === localId);
      const ids = new Set(snapshot.players.map((p) => p.id));
      for (const id of previous.keys()) if (!ids.has(id)) previous.delete(id);
      for (const player of snapshot.players) {
        const old = previous.get(player.id);
        let distance = old?.distance ?? 0;
        const position = player.id === localId ? undefined : player.position;
        if (
          old &&
          old.player.lifeId === player.lifeId &&
          player.health > 0 &&
          player.ready
        ) {
          const travelled = Math.hypot(
            player.position.x - old.player.position.x,
            player.position.z - old.player.position.z,
          );
          if (travelled < 2 && player.grounded && !player.sliding)
            distance += travelled;
          if (distance >= (player.crouched ? 2.2 : 2.5)) {
            distance = 0;
            burst(
              0.055,
              player.crouched ? 450 : 850,
              player.crouched ? 0.05 : 0.14,
              position,
            );
          }
          if (old.player.grounded && !player.grounded && player.velocity.y > 2)
            burst(0.09, 1200, 0.1, position);
          if (!old.player.grounded && player.grounded)
            burst(0.1, 450, 0.19, position);
          if (player.reloadRemaining > old.player.reloadRemaining + 0.1) {
            burst(0.14, 3800, 0.16, position);
            tone(650, 280, 0.16, 0.07, position);
          }
          if (
            old.player.reloadRemaining > 0 &&
            player.reloadRemaining === 0 &&
            equippedWeapon(old.player) === equippedWeapon(player)
          )
            burst(0.07, 2800, 0.12, position);
        } else distance = 0;
        previous.set(player.id, { player, distance });
      }
    },
    reset() {
      previous.clear();
      listener = undefined;
    },
    dispose() {
      disposed = true;
      active = false;
      previous.clear();
      for (const source of voices) {
        try {
          source.stop();
        } catch {
          /* stopped */
        }
      }
      void context?.close();
    },
  };
}
