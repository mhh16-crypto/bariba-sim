import { OUT, SAFE_RESET, oxBattle, resolveCoin } from '../engine/rules.js';
import { makeCoin, attackOX, defenceOX, deckTotal } from '../engine/coins.js';
import { newMatch } from '../engine/rules.js';
import { sectorHit, flipProbability } from '../engine/physics.js';
import { C } from '../engine/constants.js';
const flat = ox => ({ id:`b${ox}`, name:`B${ox}`, variants:[], rarity:'R', set:'synthetic', mainSide:'order', faces:{order:{label:'a',ox},xtreme:{label:'b',ox}} });
export function runBrowserTests(coins){
  const lines=[];let passed=0,failed=0;const eq=(a,b,m='')=>{if(a!==b)throw new Error(`${m} expected ${b}, got ${a}`)};
  const check=(n,fn)=>{try{fn();passed++;lines.push(`PASS  ${n}`)}catch(e){failed++;lines.push(`FAIL  ${n} — ${e.message}`)}};
  check('coins.json loaded',()=>eq(coins.length,77));
  check('OX tie favours defender',()=>eq(oxBattle(5000,5000),SAFE_RESET));
  check('OX win removes',()=>eq(oxBattle(5001,5000),OUT));
  check('meta split reaches accessors',()=>{const d=coins.find(c=>c.name==='レオウ'&&c.rarity==='BR');const c=makeCoin(d,0,'order',0,0,0);eq(attackOX(c),8000);eq(defenceOX(c),4000)});
  check('armour is not reverse spot',()=>eq(sectorHit(makeCoin(flat(1),0,'order',0,0,0),Math.PI/2).inSector,false));
  check('flip probability clamped',()=>{const p=flipProbability(1,C.MAX_SHOT_SPEED);eq(p>=.15&&p<=.85,true)});
  check('own flipped coin is OUT',()=>{const t=Object.assign(makeCoin(flat(9000),0,'order',0,0,0),{core:'released',ringUp:'xtreme'});eq(resolveCoin({coin:t,shooter:t,isShooter:true,inField:true}),OUT)});
  check('Expert deck total uses three coins',()=>eq(deckTotal([flat(4000),flat(5000),flat(6000)]),15000));
  check('Expert match creates three coins per player',()=>{
    const m=newMatch({defs:[[flat(4000),flat(5000),flat(6000)],[flat(4000),flat(5000),flat(6000)]],sides:['order','xtreme'],first:0});
    eq(m.world.coins.length,6);eq(m.world.coins.filter(c=>c.owner===0).length,3);eq(m.world.coins.filter(c=>c.owner===1).length,3);
  });
  return {passed,failed,lines};
}
