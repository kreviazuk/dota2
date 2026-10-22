import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const ROOT_DIR = process.cwd();
const PUBLIC_HEROES_DIR = path.join(ROOT_DIR, 'public', 'assets', 'heroes');
const PUBLIC_ITEMS_DIR = path.join(ROOT_DIR, 'public', 'assets', 'items');

fs.mkdirSync(PUBLIC_HEROES_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_ITEMS_DIR, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status code ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(dest));
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('--- 1. Fetching Heroes ---');
  // 10 heroes in our game
  const HERO_MAP = {
    axe: 'axe',
    sven: 'sven',
    pudge: 'pudge',
    juggernaut: 'juggernaut',
    phantom_assassin: 'phantom_assassin',
    drow_ranger: 'drow_ranger',
    shadow_fiend: 'nevermore',
    lina: 'lina',
    zeus: 'zuus',
    crystal_maiden: 'crystal_maiden',
  };

  for (const [localId, valveId] of Object.entries(HERO_MAP)) {
    const url = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${valveId}.png`;
    const dest = path.join(PUBLIC_HEROES_DIR, `${localId}.png`);
    try {
      await downloadFile(url, dest);
      console.log(`✓ Hero [${localId}] -> ${dest} (${fs.statSync(dest).size} bytes)`);
    } catch (e) {
      console.error(`✗ Failed hero [${localId}]:`, e.message);
    }
  }

  console.log('\n--- 2. Fetching Items ---');
  const odItems = await fetchJson('https://api.opendota.com/api/constants/items');
  
  // Read our item definitions
  const defsContent = fs.readFileSync(path.join(ROOT_DIR, 'src', 'sim', 'items', 'definitions.ts'), 'utf8');
  // Extract all item IDs: matches lines like "  tango: {" or "  black_king_bar: {"
  const itemMatches = [...defsContent.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)];
  const itemIds = itemMatches.map(m => m[1]);
  console.log(`Found ${itemIds.length} items in definitions.ts`);

  // Read english names if available
  const infoContent = fs.readFileSync(path.join(ROOT_DIR, 'src', 'sim', 'items', 'itemInfo.ts'), 'utf8');
  const enNameMatches = [...infoContent.matchAll(/^\s{2}([a-z0-9_]+):\s*['"]([^'"]+)['"]/gm)];
  const enNames = Object.fromEntries(enNameMatches.map(m => [m[1], m[2]]));

  let downloadedCount = 0;
  const missing = [];

  for (const itemId of itemIds) {
    let imgRelPath = null;

    // Check exact key match in OpenDota
    if (odItems[itemId]?.img) {
      imgRelPath = odItems[itemId].img;
    } else {
      // Try by English name
      const en = enNames[itemId];
      if (en) {
        for (const v of Object.values(odItems)) {
          if (v.dname && v.dname.toLowerCase().trim() === en.toLowerCase().trim()) {
            imgRelPath = v.img;
            break;
          }
        }
      }
    }

    // Special manual aliases if not found in OpenDota
    if (!imgRelPath) {
      const aliases = {
        boots_of_speed: '/apps/dota2/images/dota_react/items/boots.png',
        blink_dagger: '/apps/dota2/images/dota_react/items/blink.png',
        power_treads: '/apps/dota2/images/dota_react/items/power_treads.png',
        phase_boots: '/apps/dota2/images/dota_react/items/phase_boots.png',
        arcane_boots: '/apps/dota2/images/dota_react/items/arcane_boots.png',
        tranquil_boots: '/apps/dota2/images/dota_react/items/tranquil_boots.png',
        magic_wand: '/apps/dota2/images/dota_react/items/magic_wand.png',
        magic_stick: '/apps/dota2/images/dota_react/items/magic_stick.png',
        iron_branch: '/apps/dota2/images/dota_react/items/branches.png',
        gauntlets_of_strength: '/apps/dota2/images/dota_react/items/gauntlets.png',
        slippers_of_agility: '/apps/dota2/images/dota_react/items/slippers.png',
        mantle_of_intelligence: '/apps/dota2/images/dota_react/items/mantle.png',
        belt_of_strength: '/apps/dota2/images/dota_react/items/belt_of_strength.png',
        band_of_elvenskin: '/apps/dota2/images/dota_react/items/boots_of_elves.png',
        robe_of_the_magi: '/apps/dota2/images/dota_react/items/robe.png',
        ogre_axe: '/apps/dota2/images/dota_react/items/ogre_axe.png',
        blade_of_alacrity: '/apps/dota2/images/dota_react/items/blade_of_alacrity.png',
        staff_of_wizardry: '/apps/dota2/images/dota_react/items/staff_of_wizardry.png',
        energy_booster: '/apps/dota2/images/dota_react/items/energy_booster.png',
        vitality_booster: '/apps/dota2/images/dota_react/items/vitality_booster.png',
        point_booster: '/apps/dota2/images/dota_react/items/point_booster.png',
        euls_scepter: '/apps/dota2/images/dota_react/items/cyclone.png',
        aghanims_scepter: '/apps/dota2/images/dota_react/items/ultimate_scepter.png',
        aghanims_shard: '/apps/dota2/images/dota_react/items/aghanims_shard.png',
        sange_and_yasha: '/apps/dota2/images/dota_react/items/sange_and_yasha.png',
        monkey_king_bar: '/apps/dota2/images/dota_react/items/monkey_king_bar.png',
        daedalus: '/apps/dota2/images/dota_react/items/greater_crit.png',
        crystalys: '/apps/dota2/images/dota_react/items/lesser_crit.png',
        black_king_bar: '/apps/dota2/images/dota_react/items/black_king_bar.png',
        shadow_blade: '/apps/dota2/images/dota_react/items/invis_sword.png',
        silver_edge: '/apps/dota2/images/dota_react/items/silver_edge.png',
        echo_sabre: '/apps/dota2/images/dota_react/items/echo_sabre.png',
        assault_cuirass: '/apps/dota2/images/dota_react/items/assault.png',
        heart_of_tarrasque: '/apps/dota2/images/dota_react/items/heart.png',
        shivas_guard: '/apps/dota2/images/dota_react/items/shivas_guard.png',
        eye_of_skadi: '/apps/dota2/images/dota_react/items/skadi.png',
        diffusal_blade: '/apps/dota2/images/dota_react/items/diffusal_blade.png',
        battle_fury: '/apps/dota2/images/dota_react/items/bfury.png',
        abyssal_blade: '/apps/dota2/images/dota_react/items/abyssal_blade.png',
        skull_basher: '/apps/dota2/images/dota_react/items/basher.png',
        force_staff: '/apps/dota2/images/dota_react/items/force_staff.png',
        glimmer_cape: '/apps/dota2/images/dota_react/items/glimmer_cape.png',
        rod_of_atos: '/apps/dota2/images/dota_react/items/rod_of_atos.png',
        scythe_of_vyse: '/apps/dota2/images/dota_react/items/sheepstick.png',
        lotus_orb: '/apps/dota2/images/dota_react/items/lotus_orb.png',
        linkens_sphere: '/apps/dota2/images/dota_react/items/sphere.png',
        refresher_orb: '/apps/dota2/images/dota_react/items/refresher.png',
        octarine_core: '/apps/dota2/images/dota_react/items/octarine_core.png',
      };
      if (aliases[itemId]) {
        imgRelPath = aliases[itemId];
      }
    }

    if (!imgRelPath) {
      // Try direct filename on Valve CDN
      imgRelPath = `/apps/dota2/images/dota_react/items/${itemId}.png`;
    }

    // Strip any query params like ?t=123
    const cleanPath = imgRelPath.split('?')[0];
    const fullUrl = cleanPath.startsWith('http') ? cleanPath : `https://cdn.cloudflare.steamstatic.com${cleanPath}`;
    const dest = path.join(PUBLIC_ITEMS_DIR, `${itemId}.png`);

    try {
      await downloadFile(fullUrl, dest);
      downloadedCount++;
    } catch (e) {
      missing.push({ itemId, fullUrl, err: e.message });
    }
  }

  console.log(`\nSuccessfully downloaded ${downloadedCount}/${itemIds.length} items.`);
  if (missing.length > 0) {
    console.log(`Missing items (${missing.length}):`, missing);
  }
}

main().catch(console.error);
