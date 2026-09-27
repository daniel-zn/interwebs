// The story: every conversation, cutscene and service (healing, shops, trades,
// the Relay Loop). Scripts are async functions run with the overworld paused.
import { ITEMS, SHOPS } from './data/items.js';
import { LEGENDS } from './data/legends.js';
import { SPECIES_BY_ID } from './data/species.js';
import { TYPE_INFO } from './data/types.js';
import { makeMon, monName } from './monster.js';
import { TRADES, TRAINERS } from './world/world.js';
import { sleep } from './util.js';

const RIVAL = 'Kestrel';

async function pickup(game, obj) {
  const it = ITEMS[obj.item];
  game.setFlag(obj.flag);
  game.give(obj.item, obj.qty);
  game.audio.sfx('coin');
  await game.ui.say(`You found ${obj.qty > 1 ? `${obj.qty}× ` : ''}${it.name}!`);
}

async function readLegend(game, id) {
  const leg = LEGENDS.find((l) => l.id === id);
  const fresh = game.unlockLegend(id);
  await game.ui.say(`A lore terminal flickers on. "${leg.title}"`);
  const r = await game.ui.ask('Read it?', ['Read', 'Not now']);
  if (r === 0) {
    await game.ui.legendScreen(leg);
    game.ui.closePanel();
  }
  if (fresh) {
    game.audio.sfx('statup');
    await game.ui.say(game.s.bag.codex ? `"${leg.title}" was saved to the Legends page of your Codex.` : `You memorised "${leg.title}". It'll go in your Codex once you have one.`);
  }
}

export const SCRIPTS = {
  async object(game, obj) {
    const ui = game.ui;
    switch (obj.kind) {
      case 'item':
        return pickup(game, obj);
      case 'sign':
        if (obj.legend) return readLegend(game, obj.legend);
        return ui.say(obj.text);
      case 'pod':
        return SCRIPTS.pod(game, obj);
      case 'vault':
        return ui.vaultScreen(game);
      case 'relay':
        return SCRIPTS.relay(game);
      case 'sovereign':
        return SCRIPTS.sovereign(game);
    }
  },

  // ---------------------------------------------------------------- home & Lowdeck
  async aunt_home(game) {
    const ui = game.ui;
    if (!game.flag('starter')) {
      await ui.say([
        `Morning, ${game.s.name}! Happy Link Day!`,
        'Sixteen already. When I found you on the reactor steps you were smaller than a Kindlet.',
        'Dr. Vance is waiting at the Hatchery. That\'s the big lab just east of here with the green sign.',
        'Go pick your first drake. And remember what Mara Quell said: a tether is a promise, not a leash.',
      ], { name: 'Aunt Ren' });
      return;
    }
    const r = await ui.ask('Look at you, a real Linker! Want me to patch up your drakes?', ['Yes please', 'I\'m fine'], { name: 'Aunt Ren' });
    if (r === 0) {
      game.healParty();
      game.audio.sfx('heal');
      await ui.say('There. Good as new. Now go see the world. Well, the island.', { name: 'Aunt Ren' });
    }
  },

  async aunt_stall(game) {
    await game.ui.say(['Noodles! Hot noodles! First bowl\'s free for Linkers on their Link Day!', 'Oh, it\'s you. Eat, eat. Then go.'], { name: 'Aunt Ren' });
    if (!game.flag('free_noodles') && game.flag('starter')) {
      game.setFlag('free_noodles');
      game.give('patch', 3);
      game.audio.sfx('coin');
      await game.ui.say('Aunt Ren slipped you 3 Nanopatches with the noodles.');
    }
  },

  // ---------------------------------------------------------------- the Hatchery
  async vance(game) {
    const ui = game.ui;
    if (!game.flag('starter')) {
      await ui.say([
        `Ah! ${game.s.name}, right on time. I'm Dr. Iyo Vance. I hatch drakes, study drakes, and occasionally get set on fire by drakes.`,
        'On the counter are three hatchlings, each born from a different ember of the Sovereign.',
        'Kindlet, a Plasma drake from the reactor ducts. Drizzlit, a Coolant drake from the fog nets. Sporlet, a Bio drake from the vertical farms.',
        'Go on. Walk up to a pod and look. The one that looks back is yours.',
      ], { name: 'Dr. Vance' });
      return;
    }
    if (!game.flag('codex')) return SCRIPTS.vanceGift(game);
    const seen = Object.keys(game.s.seen).length, caught = Object.keys(game.s.caught).length;
    await ui.say([`Your Codex shows ${seen} seen and ${caught} linked. ${caught >= 20 ? 'Remarkable!' : caught >= 8 ? 'Good progress!' : 'Keep at it!'}`], { name: 'Dr. Vance' });
    const r = await ui.ask('Shall I run your drakes through the incubator? Full heal, no charge.', ['Yes', 'No thanks'], { name: 'Dr. Vance' });
    if (r === 0) {
      game.healParty();
      game.audio.sfx('heal');
      await ui.say('All patched up.', { name: 'Dr. Vance' });
    }
  },

  async pod(game, obj) {
    const ui = game.ui;
    const sp = SPECIES_BY_ID[obj.sp];
    if (game.flag('starter')) return ui.say('The pod is empty and still a little warm.');
    await ui.say(`It's ${sp.name}, the ${TYPE_INFO[sp.types[0]].name} hatchling. ${sp.lore.split('. ').slice(0, 1).join('')}.`);
    const r = await ui.ask(`Link with ${sp.name}?`, ['Yes!', 'Let me think']);
    if (r !== 0) return;
    const mon = makeMon(sp.id, 5, game.rng, { ot: game.s.name });
    game.addMon(mon);
    game.s.starter = sp.id;
    game.setFlag('starter');
    game.audio.sfx('caught');
    await ui.say(`You linked with ${sp.name}! Its tail twitches. It trusts you already.`);
    // Kestrel grabs the counter-pick and challenges you.
    const kes = game.npcs.find((n) => n.id === 'rival_lab');
    const rivalSp = SPECIES_BY_ID[{ kindlet: 'drizzlit', drizzlit: 'sporlet', sporlet: 'kindlet' }[sp.id]];
    await ui.say([`Wait wait wait! Doc said I could have one too!`, `I'll take ${rivalSp.name}. It's got a type advantage, obviously. I read the manual.`], { name: RIVAL });
    if (kes) {
      await game.walkNpc(kes, 'up', 1);
      kes.dir = 'right';
    }
    await ui.say([`I'm Kestrel, by the way. Your neighbour? Two capsules down? We've met like a hundred times.`, 'Anyway. First battle. Right now. Let\'s go!'], { name: RIVAL });
    const result = await game.trainerBattle('rival1', { canLose: true });
    if (result !== 'win') {
      await ui.say('Ha! Knew it! Okay, okay, no hard feelings. You\'ll get me next time.', { name: RIVAL });
      game.setFlag('t_rival1');
    }
    game.healParty();
    game.setFlag('rival1_done');
    await ui.say(['I\'m going to see the whole island before you. Smell you later!'], { name: RIVAL });
    if (kes) {
      await game.walkNpc(kes, 'down', 2);
      game.npcs = game.npcs.filter((n) => n !== kes);
    }
    await SCRIPTS.vanceGift(game);
  },

  async vanceGift(game) {
    const ui = game.ui;
    game.healParty();
    await ui.say([
      'Well! That was loud. I\'ve patched both your drakes up.',
      'Now, a gift. This is a Linker Codex. It records every drake you see, and when you link one it unlocks that drake\'s legend.',
      'It\'s also where I keep the old stories. Every lore terminal on the Aerie will copy itself into it.',
    ], { name: 'Dr. Vance' });
    game.give('codex');
    game.give('spike', 5);
    game.setFlag('codex');
    game.audio.sfx('caught');
    await ui.say('You got the Linker Codex and 5 Tether Spikes!');
    await ui.say([
      'Weaken a wild drake in the fibre grass, then throw a spike. Weaker drakes, and drakes on standby, link more easily.',
      'Press X or Esc, or tap Menu, to open your Codex, drakes and bag any time.',
      'The Wardens of the three Sigils are your real test. The first is Warden Volta, at the Arc Dojo in the Neon Bazaar. Go north, through the Fiberfields.',
      'And one more thing: the Heartcore has been beating faster lately. Keep your eyes open.',
    ], { name: 'Dr. Vance' });
  },

  // ---------------------------------------------------------------- services
  async medic(game) {
    const ui = game.ui;
    const r = await ui.ask('Welcome to the Patch Den! Free under the Aerie Charter. Shall I patch up your drakes?', ['Patch them up', 'No thanks'], { name: 'Medic' });
    if (r !== 0) return ui.say('Stay safe out there!', { name: 'Medic' });
    game.audio.music('clinic', true);
    game.audio.sfx('heal');
    game.healParty();
    await sleep(game.fast ? 50 : 700);
    game.s.respawn = { map: game.map.id, x: 5, y: 3 };
    game.save();
    await ui.say(['All done! Your drakes are running at full power.', 'I\'ve saved your Linker ID and set this Den as your restart point.'], { name: 'Medic' });
  },

  async shop(game, npc) {
    await game.ui.shopScreen(game, SHOPS[npc.shop]);
  },

  async trade(game, npc) {
    const ui = game.ui;
    const tr = TRADES[npc.trade];
    const want = SPECIES_BY_ID[tr.want], give = SPECIES_BY_ID[tr.give];
    if (game.flag(npc.trade)) return ui.say(`How's ${tr.nick} doing? Treat them well!`, { name: tr.ot });
    await ui.say(tr.line, { name: tr.ot });
    const r = await ui.ask(`Trade a ${want.name} for ${tr.nick} the ${give.name} (Lv${tr.lv})?`, ['Trade', 'No'], { name: tr.ot });
    if (r !== 0) return ui.say('Come back if you change your mind.', { name: tr.ot });
    if (!game.s.party.some((m) => m.sp === tr.want)) return ui.say(`You don't have a ${want.name} with you. They nest in the ${tr.want === 'boltnib' ? 'Foundry slag fields' : 'Fiberfields'}.`, { name: tr.ot });
    const i = await ui.partyScreen(game, 'pick', { title: `Trade which ${want.name}?`, filter: (m) => m.sp === tr.want });
    if (i < 0) return;
    if (game.s.party.length === 1) return ui.say('You can\'t trade away your only drake!');
    const [old] = game.s.party.splice(i, 1);
    const mon = makeMon(tr.give, tr.lv, game.rng, { nick: tr.nick, ot: tr.ot });
    game.addMon(mon);
    game.setFlag(npc.trade);
    game.audio.sfx('evolve');
    await ui.say(`${monName(old)} went to ${tr.ot}. ${tr.nick} the ${give.name} came through the relay to you!`);
    await ui.say('Traded drakes gain XP faster. They like showing off for a new Linker.', { name: tr.ot });
  },

  async relay(game) {
    const ui = game.ui;
    await ui.say('RELAY LOOP. Sends a drake around the whole island network and back. Some drakes are reforged by the trip. ₵500 per loop.');
    const r = await ui.ask('Send a drake through the loop?', ['Send one', 'No']);
    if (r !== 0) return;
    if (game.s.creds < 500) return ui.say('Not enough creds. The Relay Loop is a Helix service. Of course it costs money.');
    const i = await ui.partyScreen(game, 'pick', { title: 'Relay which drake?' });
    if (i < 0) return;
    game.s.creds -= 500;
    const mon = game.s.party[i];
    game.audio.sfx('throw');
    await ui.say(`${monName(mon)} dissolves into light and races off through the island's cables…`);
    await sleep(game.fast ? 50 : 800);
    game.audio.sfx('door');
    const evo = SPECIES_BY_ID[mon.sp].evo;
    game.setFlag('relayed');
    if (evo?.trade) {
      await ui.say(`…and comes back glowing white-hot!`);
      await game.evolveScene(mon, evo.to);
    } else await ui.say(`…and comes back, warm and a little dizzy. It seems to have enjoyed the trip.`);
  },

  async sayings(game) {
    const lines = [
      'My grandmother saw the Upfall. She said the sky went white, and when it came back, the ground was gone and we were still standing on it.',
      'Every Festival of Embers, the drakes all face the Spire at once. I asked mine why. It sneezed on me.',
      'Helix wants to "optimise" the Heartcore. You don\'t optimise a heart. You listen to it.',
    ];
    await game.ui.say(lines, { name: 'Old Toma' });
    if (!game.s.legends.festival) {
      game.unlockLegend('festival');
      await game.ui.say('Old Toma told you the story of the Festival of Embers. It was added to your Codex.');
    }
  },

  // ---------------------------------------------------------------- trainers
  async afterTrainer(game, id) {
    const ui = game.ui;
    if (id === 'volta') {
      game.setFlag('sigil1');
      game.audio.sfx('caught');
      await ui.say('You received the CURRENT SIGIL! The Wind Bridge east of the Bazaar will open for you.');
      game.save();
    }
    if (id === 'ferra') {
      game.setFlag('sigil2');
      game.audio.sfx('caught');
      await ui.say('You received the ALLOY SIGIL! The gate north of Turbine Ridge will open for you.');
      game.unlockLegend('crucible');
      game.save();
    }
    if (id === 'nyx') {
      game.setFlag('sigil3');
      game.give('heartlink');
      game.audio.sfx('caught');
      await ui.say(['You received the NIGHT SIGIL!', 'You received the HEARTLINK! It hums against your palm like a second pulse.']);
      game.unlockLegend('dream');
      game.save();
    }
    if (id === 'kade') {
      game.setFlag('kade_done');
      game.audio.sfx('heartbeat');
      await ui.say([
        'Behind Kade, the Heartcore flares. The whole Spire shudders.',
        'Kade: "No, no, no. The override was still running. It\'s waking up."',
        'Director Kade backs away and flees down the stairs.',
        'Something enormous is taking shape above the heart. It\'s looking at you.',
      ]);
      const kade = game.npcs.find((n) => n.id === 'kade');
      if (kade) game.npcs = game.npcs.filter((n) => n !== kade);
      game.setFlag('kade_gone');
    }
  },

  // ---------------------------------------------------------------- the Sovereign
  async sovereign(game) {
    const ui = game.ui;
    if (!game.flag('kade_done')) return ui.say('A faint shape drifts inside the Heartcore\'s light, like a dream it hasn\'t finished having.');
    game.audio.sfx('heartbeat');
    await ui.say(['The Aether Sovereign fills the chamber: wings of starlight, a body of night sky.', 'It is not angry. It is testing you.']);
    const r = await ui.ask('Face the Sovereign?', ['Face it', 'Not yet']);
    if (r !== 0) return;
    const mon = makeMon('sovereign', 45, game.rng, { iv: [15, 15, 15, 15, 15] });
    const result = await game.startBattle({ wild: mon, legendary: true, music: 'legend', bg: 'heart' });
    if (result === 'caught') {
      game.setFlag('sovereign_caught');
      game.unlockLegend('sovereign');
      await SCRIPTS.ending(game);
    } else if (result !== 'lose') {
      await ui.say('The Sovereign sinks back into the heart\'s light to rest. It will wake again when you return.');
    }
  },

  async ending(game) {
    const ui = game.ui;
    const el = document.getElementById('ending');
    await ui.say([
      'The Heartcore\'s beat slows. Once a minute. Steady.',
      'The Sovereign doesn\'t pull against the tether. It rests against it, the way a Kindlet curls around a warm cable.',
    ]);
    game.audio.music('title', true);
    el.hidden = false;
    const lines = [...el.querySelectorAll('p')];
    for (const p of lines) p.classList.remove('on');
    for (const p of lines) {
      p.classList.add('on');
      await sleep(game.fast ? 30 : 1600);
    }
    await new Promise((res) => {
      const pop = game.input.push((act) => {
        if (act === 'a' || act === 'b') {
          pop();
          res();
        }
      });
      el.onclick = () => {
        pop();
        res();
      };
    });
    el.hidden = true;
    game.setFlag('ending_seen');
    game.save();
    await ui.say('You can keep exploring the Aerie. There are still drakes to link, and Kestrel wants a rematch someday.');
  },
};

/** Step triggers. Return true to stop other step checks. */
export async function onTrigger(game, id) {
  const ui = game.ui;
  if (id === 'need_starter' && !game.flag('starter')) {
    await ui.say(['Hold it! You can\'t go into the Fiberfields without a drake!', 'Dr. Vance is waiting at the Hatchery, east of here.'], { name: 'Aunt Ren' });
    await game.walkPlayer('down', 1);
    return true;
  }
  if (id === 'rival2' && game.flag('sigil1') && !game.flag('t_rival2') && !game.flag('rival2_met')) {
    game.setFlag('rival2_met');
    const p = game.player;
    const kes = { id: 'kes2', x: p.x + 4, y: p.y, px: (p.x + 4) * 16, py: p.y * 16, dir: 'left', look: 'rival' };
    game.npcs.push(kes);
    game.audio.sfx('exclaim');
    game.emote(kes, '!');
    await game.walkNpc(kes, 'left', 3);
    game.player.dir = 'right';
    game.audio.music('battle');
    await ui.say(TRAINERS.rival2.intro, { name: RIVAL });
    const r = await game.trainerBattle('rival2');
    if (r !== 'win') {
      game.setFlag('t_rival2');
      await ui.say('Told you! Okay. Rest up. See you at the top.', { name: RIVAL });
    }
    await game.walkNpc(kes, 'right', 4);
    game.npcs = game.npcs.filter((n) => n !== kes);
    return true;
  }
  return false;
}
