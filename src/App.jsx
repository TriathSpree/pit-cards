import { useState, useEffect } from "react";
import { useUser, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import GamePage4J from "./GamePage4J.jsx";

// ── AIRTABLE via API Routes Vercel ───────────────────────────────────────────

async function storageGetPlayer(clerkId) {
  if (!clerkId) return null;
  try {
    const r = await fetch(`/api/getPlayer?clerkId=${encodeURIComponent(clerkId)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.found) return null;
    const f = d.fields;
    return {
      playerName: f.nom||"",
      objPts: f.objPts||0, manchesPlayed: f.manchesPlayed||0, wins: f.wins||0,
      totalKm: f.totalKm||0, bestMancheScore: f.bestMancheScore||0,
      unlocked: JSON.parse(f.unlocked||"[]"),
      triedDifficulties: JSON.parse(f.triedDifficulties||"[]"),
      winStreak: f.winStreak||0, avatar: f.avatar||"🧑",
      dailyDone: JSON.parse(f.dailyDone||"{}"),
      stats_solo: JSON.parse(f.stats_solo||"{}"),
      stats_4j: JSON.parse(f.stats_4j||"{}"),
      stats_online: JSON.parse(f.stats_online||"{}"),
      _recId: d.id
    };
  } catch { return null; }
}

async function storageSavePlayer(clerkId, pseudo, progress) {
  if (!clerkId) return;
  const fields = {
    clerkId,
    nom: pseudo||progress.playerName||"Joueur",
    objPts: progress.objPts||0, manchesPlayed: progress.manchesPlayed||0,
    wins: progress.wins||0, totalKm: progress.totalKm||0, bestMancheScore: progress.bestMancheScore||0,
    unlocked: JSON.stringify(progress.unlocked||[]),
    triedDifficulties: JSON.stringify(progress.triedDifficulties||[]),
    winStreak: progress.winStreak||0, updatedAt: new Date().toISOString(),
    avatar: progress.avatar||"🧑",
    dailyDone: JSON.stringify(progress.dailyDone||{}),
    dailyKey: getDailyKey(),
    dailyPts: Object.entries(progress.dailyDone||{})
      .filter(([k])=>k===getDailyKey())
      .flatMap(([,ids])=>ids)
      .reduce((s,id)=>{const o=DAILY_POOL.find(x=>x.id===id);return s+(o?o.pts:0);},0),
    stats_solo: JSON.stringify(progress.stats_solo||{}),
    stats_4j: JSON.stringify(progress.stats_4j||{}),
    stats_online: JSON.stringify(progress.stats_online||{}),
  };
  try {
    const r = await fetch("/api/savePlayer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, recId: progress._recId||null })
    });
    const d = await r.json();
    if (d.id && !progress._recId) progress._recId = d.id;
  } catch(e) { console.warn("save error:", e); }
}

async function sharedSaveScore(clerkId, pseudo, progress) { await storageSavePlayer(clerkId, pseudo, progress); }

async function sharedGetLeaderboard() {
  try {
    const r = await fetch("/api/leaderboard");
    if (!r.ok) return [];
    const d = await r.json();
    return (d.records||[]).map(rec => ({
      nom: rec.fields.nom||"?", objPts: rec.fields.objPts||0,
      manchesPlayed: rec.fields.manchesPlayed||0, wins: rec.fields.wins||0
    }));
  } catch { return []; }
}


// ── DONNÉES JEU ───────────────────────────────────────────────────────────────
const BORNES=[{id:"b25",type:"borne",km:25,label:"25 km"},{id:"b50",type:"borne",km:50,label:"50 km"},{id:"b75",type:"borne",km:75,label:"75 km"},{id:"b100",type:"borne",km:100,label:"100 km"},{id:"b200",type:"borne",km:200,label:"200 km"}];
const ATTAQUES=[{id:"accident",type:"attaque",label:"Collision"},{id:"panne",type:"attaque",label:"Manque de carburant"},{id:"crevaison",type:"attaque",label:"Pneus usés"},{id:"feu_rouge",type:"attaque",label:"🚩 Drapeau rouge"},{id:"limite",type:"attaque",label:"🟡 Drapeau jaune"}];
const PARADES=[{id:"reparations",type:"parade",label:"Arrêt au stand",attaque:"accident"},{id:"essence",type:"parade",label:"Ravitaillement",attaque:"panne"},{id:"roue_secours",type:"parade",label:"Pneus neufs",attaque:"crevaison"},{id:"feu_vert",type:"parade",label:"🟢 Drapeau vert",attaque:"feu_rouge"},{id:"fin_limite",type:"parade",label:"Vitesse libre",attaque:"limite"}];
const BOTTES=[{id:"as_volant",type:"botte",label:"Pole Position",counters:"accident"},{id:"citerne",type:"botte",label:"Réserve carburant",counters:"panne"},{id:"increvable",type:"botte",label:"Pneus Kevlar",counters:"crevaison"},{id:"prioritaire",type:"botte",label:"Safety Car",counters:["feu_rouge","limite"]}];
const ALL=[...BORNES,...ATTAQUES,...PARADES,...BOTTES];
const getCard=id=>ALL.find(c=>c.id===id);
const botteFor=id=>BOTTES.find(b=>Array.isArray(b.counters)?b.counters.includes(id):b.counters===id);
const TOTAL_QTY={accident:3,panne:3,crevaison:3,feu_rouge:5,limite:4,reparations:6,essence:6,roue_secours:6,feu_vert:14,fin_limite:6,as_volant:1,citerne:1,increvable:1,prioritaire:1,b25:10,b50:10,b75:10,b100:12,b200:4};
const SCORE_CIBLE=5000;
const VERSION="1.5.56";
const GAME_NAME="Pit Cards";

const OBJECTIFS=[
  // mode: "solo" = Solo vs Victor uniquement, "4j" = 1vs3IA uniquement, null = les deux
  {id:"first_win",cat:"🏁 Victoire",label:"Première victoire",desc:"Gagner ton premier championnat",pts:100,mode:null},
  {id:"win5",cat:"🏁 Victoire",label:"Série de 5",desc:"Gagner 5 championnats",pts:300,mode:null},
  {id:"win10",cat:"🏁 Victoire",label:"Vétéran",desc:"Gagner 10 championnats",pts:600,mode:null},
  {id:"win50",cat:"🏁 Victoire",label:"Champion",desc:"Gagner 50 championnats",pts:800,mode:null},
  {id:"win100",cat:"🏁 Victoire",label:"Légende",desc:"Gagner 100 championnats",pts:1500,mode:null},
  {id:"win3_streak",cat:"🏁 Victoire",label:"Triplé",desc:"Gagner 3 championnats de suite",pts:500,mode:null},
  {id:"win_hard",cat:"🏁 Victoire",label:"Casse-cou",desc:"Gagner en mode Difficile",pts:400,mode:null},
  {id:"win_hardcore",cat:"🏁 Victoire",label:"Intouchable",desc:"Gagner en mode Hardcore",pts:800,mode:null},
  {id:"win_fast",cat:"🏁 Victoire",label:"Éclair",desc:"Gagner en moins de 5 courses",pts:400,mode:null},
  {id:"win_no_discard",cat:"🏁 Victoire",label:"Sans gaspillage",desc:"Gagner sans jamais défausser",pts:350,mode:null},
  {id:"win_from_zero",cat:"🏁 Victoire",label:"Remontée héroïque",desc:"Gagner en étant à 0 km au début de la dernière course",pts:450,mode:null},
  {id:"win_solo_hard",cat:"🏁 Victoire",label:"Domination",desc:"Gagner 5 fois de suite contre Victor",pts:600,mode:"solo"},
  {id:"win_4j_comeback",cat:"🏁 Victoire",label:"Revanche collective",desc:"Gagner un championnat à 4 en étant dernier à mi-chemin",pts:500,mode:"4j"},
  {id:"win_4j_wire",cat:"🏁 Victoire",label:"Sur le fil",desc:"Gagner une course à 4 avec moins de 100 pts d'avance sur le 2ème",pts:400,mode:"4j"},
  {id:"no_block",cat:"🛣️ Kilomètres",label:"Route libre",desc:"Gagner une course sans jamais être bloqué",pts:350,mode:null},
  {id:"no_200",cat:"🛣️ Kilomètres",label:"Sans turbo",desc:"Gagner une course sans jouer de carte 200 km",pts:250,mode:null},
  {id:"total_10k",cat:"🛣️ Kilomètres",label:"10 000 km",desc:"Parcourir 10 000 km au total",pts:300,mode:null},
  {id:"total_50k",cat:"🛣️ Kilomètres",label:"50 000 km",desc:"Parcourir 50 000 km au total",pts:700,mode:null},
  {id:"five_200",cat:"🛣️ Kilomètres",label:"Turbo x5",desc:"Jouer 5 cartes 200 km dans un même championnat",pts:300,mode:null},
  {id:"km_1000_solo",cat:"🛣️ Kilomètres",label:"Parfait",desc:"Atteindre exactement 1000 km contre Victor sans dépasser",pts:200,mode:"solo"},
  {id:"km_4j_leader",cat:"🛣️ Kilomètres",label:"En tête",desc:"Être premier en km pendant 3 courses consécutives à 4 joueurs",pts:350,mode:"4j"},
  {id:"capot",cat:"💥 Attaque",label:"Capot !",desc:"Laisser un adversaire à 0 km en fin de course",pts:500,mode:null},
  {id:"capot_3",cat:"💥 Attaque",label:"Triple capot",desc:"Laisser les 3 adversaires à 0 km dans la même course",pts:800,mode:"4j"},
  {id:"cf1",cat:"💥 Attaque",label:"Coup-Fourré",desc:"Réussir 1 Coup-Fourré",pts:150,mode:null},
  {id:"cf3",cat:"💥 Attaque",label:"Triple Fourré",desc:"Réussir 3 Coups-Fourrés en un championnat",pts:400,mode:null},
  {id:"cf2_manche",cat:"💥 Attaque",label:"Double Fourré",desc:"Réussir 2 Coups-Fourrés dans la même course",pts:350,mode:null},
  {id:"all_bottes",cat:"💥 Attaque",label:"Arsenal complet",desc:"Jouer les 4 bottes dans une même course",pts:450,mode:null},
  {id:"attack10",cat:"💥 Attaque",label:"Agressif",desc:"Attaquer Victor 10 fois dans un même championnat",pts:300,mode:"solo"},
  {id:"attack_all_4j",cat:"💥 Attaque",label:"Semeur de chaos",desc:"Attaquer les 3 adversaires dans la même course à 4",pts:400,mode:"4j"},
  {id:"all_attacks",cat:"💥 Attaque",label:"Panoplie",desc:"Utiliser les 5 attaques différentes dans un championnat",pts:500,mode:null},
  {id:"chain_attack_4j",cat:"💥 Attaque",label:"Réaction en chaîne",desc:"Attaquer 3 fois de suite sans jamais être attaqué à 4 joueurs",pts:450,mode:"4j"},
  {id:"no_attack",cat:"⚡ Exploits",label:"Invincible",desc:"Gagner une course sans jamais être attaqué",pts:300,mode:null},
  {id:"comeback",cat:"⚡ Exploits",label:"Remontada",desc:"Gagner alors que Victor avait plus de 800 km",pts:350,mode:"solo"},
  {id:"win_while_limited",cat:"⚡ Exploits",label:"Limité mais vainqueur",desc:"Gagner une course en étant limité en vitesse",pts:300,mode:null},
  {id:"win_small_bornes",cat:"⚡ Exploits",label:"Petit pas",desc:"Gagner avec uniquement des 25 km et 50 km",pts:400,mode:null},
  {id:"win_vs_prioritaire",cat:"⚡ Exploits",label:"Sans peur",desc:"Gagner alors que Victor avait la Safety Car",pts:350,mode:"solo"},
  {id:"last_start_win",cat:"⚡ Exploits",label:"Tortue gagnante",desc:"Être le dernier à démarrer et gagner la course à 4",pts:500,mode:"4j"},
  {id:"win_4j_no_cf",cat:"⚡ Exploits",label:"Fair-play",desc:"Gagner un championnat à 4 sans aucun Coup-Fourré",pts:300,mode:"4j"},
  {id:"solo_capot_hard",cat:"⚡ Exploits",label:"Écrasant",desc:"Laisser Victor à 0 km en mode Difficile",pts:600,mode:"solo"},
  {id:"discard20",cat:"🎯 Stratégie",label:"Sélectif",desc:"Défausser 20 cartes dans un même championnat",pts:250,mode:null},
  {id:"win_no_attack",cat:"🎯 Stratégie",label:"Pacifiste",desc:"Gagner sans jamais attaquer",pts:400,mode:null},
  {id:"win_all_bottes",cat:"🎯 Stratégie",label:"Blindé",desc:"Gagner avec les 4 bottes jouées",pts:300,mode:null},
  {id:"solo_win_3bottes",cat:"🎯 Stratégie",label:"Fortifié",desc:"Gagner contre Victor avec exactement 3 bottes jouées",pts:250,mode:"solo"},
  {id:"4j_win_no_bottes",cat:"🎯 Stratégie",label:"À mains nues",desc:"Gagner un championnat à 4 sans jouer aucune botte",pts:500,mode:"4j"},
  {id:"4j_sabotage",cat:"🎯 Stratégie",label:"Saboteur",desc:"Attaquer le joueur en tête 5 fois dans un championnat à 4",pts:350,mode:"4j"},
  {id:"play10",cat:"😊 Progression",label:"Apprenti",desc:"Jouer 10 courses au total",pts:200,mode:null},
  {id:"play50",cat:"😊 Progression",label:"Routard",desc:"Jouer 50 courses au total",pts:500,mode:null},
  {id:"play100",cat:"😊 Progression",label:"Habitué",desc:"Jouer 100 courses au total",pts:800,mode:null},
  {id:"play500",cat:"😊 Progression",label:"Marathonien",desc:"Jouer 500 courses au total",pts:1500,mode:null},
  {id:"play10_solo",cat:"😊 Progression",label:"Rival de Victor",desc:"Jouer 10 championnats Solo vs Victor",pts:150,mode:"solo"},
  {id:"play10_4j",cat:"😊 Progression",label:"Habitué du peloton",desc:"Jouer 10 championnats à 4 joueurs",pts:150,mode:"4j"},
  {id:"unlock_hardcore",cat:"😊 Progression",label:"Élite",desc:"Débloquer le mode Hardcore",pts:300,mode:null},
  {id:"all_difficulties",cat:"😊 Progression",label:"Explorateur",desc:"Tester les 4 niveaux de difficulté",pts:200,mode:null},
  {id:"play_both_modes",cat:"😊 Progression",label:"Polyvalent",desc:"Gagner au moins un championnat dans chaque mode",pts:300,mode:null},
  {id:"all_objectives",cat:"🌟 Prestige",label:"Perfectionniste",desc:"Débloquer tous les autres objectifs",pts:2000,mode:null},
];
const TOTAL_OBJ_PTS=OBJECTIFS.reduce((s,o)=>s+o.pts,0);
const INIT_PROGRESS={wins:0,manchesPlayed:0,unlocked:[],objPts:0,playerName:"",totalKm:0,bestMancheScore:0,winStreak:0,triedDifficulties:[],avatar:"🧑",dailyDone:{},
  stats_solo:{wins:0,played:0,totalKm:0,bestScore:0,winStreak:0},
  stats_4j:{wins:0,played:0,totalKm:0,bestScore:0,winStreak:0},
  stats_online:{wins:0,played:0,totalKm:0,bestScore:0,winStreak:0},
};

function buildDeck(){const d=[];BORNES.forEach(c=>{const q={b25:10,b50:10,b75:10,b100:12,b200:4};for(let i=0;i<q[c.id];i++)d.push(c.id);});ATTAQUES.forEach(c=>{const q={accident:3,panne:3,crevaison:3,feu_rouge:5,limite:4};for(let i=0;i<q[c.id];i++)d.push(c.id);});PARADES.forEach(c=>{const q={reparations:6,essence:6,roue_secours:6,feu_vert:14,fin_limite:6};for(let i=0;i<q[c.id];i++)d.push(c.id);});BOTTES.forEach(c=>d.push(c.id));return shuffle(d);}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function mkP(hand){return{hand,km:0,attaque:null,limitee:false,started:false,bottes:[],coupsFourres:0,bornes:[],lastCard:null,lastLimite:null,wasAttacked:false};}
function calcScore(p,w,opponent){let s=p.km;if(w&&p.km===1000)s+=400;s+=p.bottes.length*100;s+=(p.coupsFourres||0)*300;if(w&&!(p.bornes||[]).includes("b200"))s+=300;if(w&&opponent&&opponent.km===0)s+=500;return s;}
function initManche(fp,diff){const d=buildDeck();const pc=diff==="hardcore"?5:6;return{deck:d,discard:[],player:mkP(d.splice(0,pc)),ai:mkP(d.splice(0,6)),turn:fp,phase:"play",log:[{text:"Course — À vous !",who:"system"}],winner:null,coupFourreAvailable:null,drawn:false};}
function canBorne(p,id){const c=getCard(id);if(!p.started||p.attaque)return false;if(p.limitee&&c.km>50)return false;if(id==="b200"&&(p.bornes||[]).filter(b=>b==="b200").length>=2)return false;return p.km+c.km<=1000;}
function canParade(p,id){const c=getCard(id);if(c.id==="feu_vert"){if(!p.started)return true;return p.attaque==="feu_rouge";}if(c.id==="fin_limite")return p.limitee;return p.attaque===c.attaque;}
function canAttaque(t,id){const b=botteFor(id);if(b&&t.bottes.includes(b.id))return false;if(!t.started&&id!=="limite")return false;if(id==="limite")return!t.limitee;return!t.attaque;}
function getPlays(s,who){const a=s[who],t=who==="player"?s.ai:s.player,v=[];a.hand.forEach(id=>{const c=getCard(id);if(c.type==="borne"&&canBorne(a,id))v.push({cardId:id,action:"borne"});if(c.type==="parade"&&canParade(a,id))v.push({cardId:id,action:"parade"});if(c.type==="attaque"&&canAttaque(t,id))v.push({cardId:id,action:"attaque"});if(c.type==="botte")v.push({cardId:id,action:"botte"});});return v;}
function applyPlay(state,who,cardId,action,plbl){const s=JSON.parse(JSON.stringify(state));const actor=s[who],target=who==="player"?s.ai:s.player;const idx=actor.hand.indexOf(cardId);if(idx!==-1)actor.hand.splice(idx,1);const L=who==="player"?plbl:"Victor";if(action==="borne"){actor.bornes=(actor.bornes||[]).concat(cardId);actor.km+=getCard(cardId).km;s.log.unshift({text:L+" avance de "+getCard(cardId).km+" km (total: "+actor.km+" km)",who});}else if(action==="parade"){const c=getCard(cardId);if(c.id==="fin_limite"){actor.limitee=false;actor.lastLimite=cardId;s.log.unshift({text:L+" retire la limitation.",who});}else if(c.id==="feu_vert"){if(actor.attaque==="feu_rouge")actor.attaque=null;actor.started=true;actor.lastCard=cardId;s.log.unshift({text:L+" passe au feu vert !",who});}else{actor.attaque=null;actor.lastCard=cardId;s.log.unshift({text:L+" répare : "+c.label,who});}}else if(action==="attaque"){const c=getCard(cardId);if(c.id==="limite"){target.limitee=true;target.lastLimite=cardId;}else{target.attaque=cardId;target.lastCard=cardId;target.wasAttacked=true;}s.log.unshift({text:L+" joue : "+c.label+" sur l'adversaire !",who});}else if(action==="botte"){const bo=getCard(cardId);actor.bottes.push(cardId);const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];if(actor.attaque&&co.includes(actor.attaque)){actor.attaque=null;actor.lastCard=actor.started?"feu_vert":null;}if(bo.id==="prioritaire"){actor.limitee=false;actor.lastLimite="fin_limite";}s.log.unshift({text:L+" joue la botte : "+bo.label+" !",who});}return s;}
function drawCard(s,who){s=JSON.parse(JSON.stringify(s));if(s.deck.length===0){if(s.discard.length===0)return s;s.deck=[...s.discard];s.discard=[];s.log.unshift({text:"🔄 Pioche reconstituée.",who:"system"});}s[who].hand.push(s.deck.shift());return s;}
function discardCard(s,who,id,plbl){s=JSON.parse(JSON.stringify(s));const i=s[who].hand.indexOf(id);if(i!==-1)s[who].hand.splice(i,1);s.discard.push(id);s.log.unshift({text:(who==="player"?plbl:"Victor")+" défausse : "+getCard(id)?.label+".",who});return s;}
function checkWin(s){if(s.player.km===1000)return"player";if(s.ai.km===1000)return"ai";if(s.deck.length===0&&s.discard.length===0)return s.player.km>=s.ai.km?"player":"ai";return null;}
function aiChoosePlay(plays,s,diff){if(plays.length===0)return null;if(diff==="easy")return plays[Math.floor(Math.random()*plays.length)];const hand=s.ai.hand;const nb=hand.filter(c=>getCard(c).type==="botte").length;const seuil=nb>=2?700:800;const botte=plays.find(p=>{if(p.action!=="botte")return false;const bo=getCard(p.cardId);const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];const urgent=co.some(c=>s.ai.attaque===c||(c==="limite"&&s.ai.limitee));return urgent||s.player.km>=seuil||(s.deck.length===0&&s.discard.length===0);});const parade=plays.find(p=>p.action==="parade");const bornes=plays.filter(p=>p.action==="borne").sort((a,b)=>getCard(b.cardId).km-getCard(a.cardId).km);let atqList=plays.filter(p=>p.action==="attaque");if(diff==="hard"){const seen=[...s.discard,...s.ai.bottes,...s.player.bottes,...(s.ai.bornes||[]),...(s.player.bornes||[])];atqList=atqList.filter(p=>{const bo=botteFor(p.cardId);if(!bo)return true;if(s.player.bottes.includes(bo.id))return false;const sc=seen.filter(c=>c===bo.id).length+hand.filter(c=>c===bo.id).length;return(TOTAL_QTY[bo.id]||0)-sc>0;});}if(diff==="hardcore"){const botteUrgent=plays.find(p=>{if(p.action!=="botte")return false;const bo=getCard(p.cardId);const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];return co.some(c=>s.ai.attaque===c||(c==="limite"&&s.ai.limitee));});const botteAny=plays.find(p=>p.action==="botte");return botteUrgent||atqList[0]||parade||botteAny||bornes[0]||null;}return botte||parade||atqList[0]||bornes[0]||null;}
function aiChooseDiscard(s,diff){const hand=s.ai.hand;const km=s.ai.km;if(diff==="easy"){const nb=hand.filter(c=>getCard(c).type!=="botte");return nb.length>0?nb[Math.floor(Math.random()*nb.length)]:null;}if(diff==="hard"||diff==="hardcore"){const reste=1000-km;if(reste<=175&&hand.includes("b200"))return"b200";if(reste<=75&&hand.includes("b100"))return"b100";if(reste<=50&&hand.includes("b75"))return"b75";if(reste<=25&&hand.includes("b50"))return"b50";}if(diff==="hardcore"){const parI=hand.find(c=>{const card=getCard(c);if(card.type!=="parade")return false;if(card.id==="feu_vert")return s.ai.started&&s.ai.attaque!=="feu_rouge";if(card.id==="fin_limite")return!s.ai.limitee;return s.ai.attaque!==card.attaque;});const bm=hand.filter(c=>getCard(c).type==="borne").sort((a,b)=>getCard(a).km-getCard(b).km);return parI||bm[0]||hand.find(c=>getCard(c).type!=="botte"&&getCard(c).type!=="attaque")||null;}const atqI=hand.find(c=>{if(getCard(c).type!=="attaque")return false;const b=botteFor(c);return b&&s.player.bottes.includes(b.id);});const parI=hand.find(c=>{const card=getCard(c);if(card.type!=="parade")return false;const bc=BOTTES.find(b=>{if(card.id==="feu_vert"||card.id==="fin_limite")return b.id==="prioritaire";const co=Array.isArray(b.counters)?b.counters:[b.counters];return co.includes(card.attaque);});if(bc&&(s.ai.bottes.includes(bc.id)||hand.includes(bc.id)))return true;if(card.id==="feu_vert")return s.ai.started&&s.ai.attaque!=="feu_rouge";if(card.id==="fin_limite")return!s.ai.limitee;return s.ai.attaque!==card.attaque;});const bm=hand.filter(c=>getCard(c).type==="borne").sort((a,b)=>getCard(a).km-getCard(b).km);const aP=s.ai.bottes.includes("prioritaire")||hand.includes("prioritaire");const atqR=hand.find(c=>{if(getCard(c).type!=="attaque")return false;if(aP&&(c==="feu_rouge"||c==="limite"))return false;const b=botteFor(c);if(b&&!s.player.bottes.includes(b.id)){const victorHas=s.ai.bottes.includes(b.id)||hand.filter(x=>x===b.id).length>0;if(victorHas)return false;}return hand.filter(x=>x===c).length>=2;});const parD=hand.find(c=>getCard(c).type==="parade"&&hand.filter(x=>x===c).length>=2);const cands=[atqI,parI,bm.length>=4?bm[0]:null,atqR,parD,bm[0],hand.find(c=>getCard(c).type!=="botte")];return cands.find(c=>c&&getCard(c)&&getCard(c).type!=="botte")||null;}
function cColor(id,dark){const c=getCard(id);if(!c)return dark?"#666":"#888";if(c.type==="borne")return dark?"#2e86c1":"#1a5276";if(c.type==="attaque")return dark?"#c0392b":"#922b21";if(c.type==="parade")return dark?"#27ae60":"#1e8449";if(c.type==="botte")return dark?"#d4ac0d":"#7d6608";return dark?"#777":"#555";}
function cEmoji(id){return{b25:"🚶",b50:"🚲",b75:"🛵",b100:"🏎️",b200:"✈️",accident:"💥",panne:"⛽",crevaison:"🔧",feu_rouge:"🚩",limite:"🟡",reparations:"🔩",essence:"⛽",roue_secours:"🔄",feu_vert:"🟢",fin_limite:"⚡",as_volant:"⭐",citerne:"🛢️",increvable:"🛡️",prioritaire:"🚔"}[id]||"🃏";}
const DOTS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};
function De({val,dark}){const dots=DOTS[val]||DOTS[1];return(<div style={{width:"65px",height:"65px",background:dark?"#2a2a3e":"#fff",borderRadius:"12px",border:"3px solid "+(dark?"#555":"#2c1810"),position:"relative",boxShadow:"3px 3px 8px rgba(0,0,0,0.4)"}}>{dots.map((p,i)=><div key={i} style={{position:"absolute",width:"11px",height:"11px",background:dark?"#e0e0e0":"#2c1810",borderRadius:"50%",left:"calc("+p[0]+"% - 5px)",top:"calc("+p[1]+"% - 5px)"}}/>)}</div>);}
function playSound(type,on){if(!on)return;try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const g=ctx.createGain();g.connect(ctx.destination);if(type==="click"){const o=ctx.createOscillator();o.connect(g);o.frequency.value=800;g.gain.setValueAtTime(0.1,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.08);o.start();o.stop(ctx.currentTime+0.08);}else if(type==="play"){const o=ctx.createOscillator();o.connect(g);o.type="triangle";o.frequency.setValueAtTime(400,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(600,ctx.currentTime+0.1);g.gain.setValueAtTime(0.15,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.15);o.start();o.stop(ctx.currentTime+0.15);}else if(type==="attack"){const o=ctx.createOscillator();o.connect(g);o.type="sawtooth";o.frequency.setValueAtTime(200,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(120,ctx.currentTime+0.3);g.gain.setValueAtTime(0.2,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);o.start();o.stop(ctx.currentTime+0.3);}else if(type==="cf"){[0,0.05,0.1].forEach(t=>{const o=ctx.createOscillator();o.connect(g);o.type="square";o.frequency.value=880;g.gain.setValueAtTime(0.15,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.08);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.08);});}else if(type==="win"){[0,0.15,0.3,0.45,0.6].forEach((t,i)=>{const o=ctx.createOscillator();o.connect(g);o.type="triangle";o.frequency.value=[523,659,784,1047,1319][i];g.gain.setValueAtTime(0.15,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.2);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.2);});}else if(type==="lose"){const o=ctx.createOscillator();o.connect(g);o.type="sawtooth";o.frequency.setValueAtTime(400,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(150,ctx.currentTime+0.6);g.gain.setValueAtTime(0.15,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);o.start();o.stop(ctx.currentTime+0.6);}else if(type==="draw"){const o=ctx.createOscillator();o.connect(g);o.frequency.value=440;g.gain.setValueAtTime(0.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.12);o.start();o.stop(ctx.currentTime+0.12);}else if(type==="obj"){const o=ctx.createOscillator();o.connect(g);o.type="triangle";g.gain.setValueAtTime(0.2,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);o.frequency.setValueAtTime(880,ctx.currentTime);o.frequency.setValueAtTime(1100,ctx.currentTime+0.1);o.frequency.setValueAtTime(1320,ctx.currentTime+0.2);o.start();o.stop(ctx.currentTime+0.4);}setTimeout(()=>ctx.close(),1000);}catch(e){}}



// ── HOME PAGE ──────────────────────────────────────────────────────────────────
function DailyPanel({progress,dark,th,dailyObjectifs,dailyKey,dailyDone,dailyLB,loadingDailyLB,medals}){
  const [dailyMode,setDailyMode]=useState("solo");
  const modeLabels={solo:"1 vs 1","4j":"1 vs 3",online:"En ligne"};
  const modeIcons={solo:"🏎️","4j":"🚗",online:"🌐"};
  const quetes=dailyMode==="online"?[]:(dailyObjectifs[dailyMode]||[]);
  const done=(dailyDone[dailyKey]||[]);
  const modePts=quetes.filter(o=>done.includes(o.id)).reduce((s,o)=>s+o.pts,0);
  const maxPts=quetes.reduce((s,o)=>s+o.pts,0);
  return(
    <div>
      <div style={{display:"flex",gap:"4px",marginBottom:"12px"}}>
        {["solo","4j","online"].map(m=>(
          <button key={m} onClick={()=>setDailyMode(m)} style={{flex:1,padding:"8px",border:"2px solid "+(dailyMode===m?th.title:th.border),borderRadius:"10px",background:dailyMode===m?(dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.08)"):"transparent",color:dailyMode===m?th.title:th.subtext,fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold",cursor:"pointer"}}>
            {modeIcons[m]} {modeLabels[m]}
          </button>
        ))}
      </div>
      {dailyMode==="online"?(
        <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",padding:"30px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>🌐 Mode En ligne — Bientôt disponible</div>
      ):(
        <>
          <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",padding:"12px 16px",marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <div style={{fontSize:"13px",fontWeight:"bold",color:th.title}}>📅 Défis du jour — {modeLabels[dailyMode]}</div>
              <div style={{fontSize:"10px",color:th.subtext}}>Reset à minuit</div>
            </div>
            {quetes.map((o,i)=>{
              const isDone=done.includes(o.id);
              const diffColor=o.diff==="easy"?"#27ae60":o.diff==="medium"?"#e67e22":"#c0392b";
              const diffLabel=o.diff==="easy"?"Facile":o.diff==="medium"?"Moyen":"Difficile";
              return(
                <div key={o.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"10px 0",borderTop:i>0?"1px solid "+th.border:"none"}}>
                  <div style={{fontSize:"22px",flexShrink:0}}>{isDone?"✅":"🎯"}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"2px"}}>
                      <span style={{fontSize:"12px",fontWeight:"bold",color:isDone?th.subtext:th.text,textDecoration:isDone?"line-through":"none"}}>{o.label}</span>
                      <span style={{fontSize:"8px",background:diffColor,color:"#fff",borderRadius:"4px",padding:"1px 5px",fontWeight:"bold"}}>{diffLabel}</span>
                    </div>
                    <div style={{fontSize:"10px",color:th.subtext}}>{o.desc}</div>
                  </div>
                  <div style={{fontSize:"13px",fontWeight:"bold",color:isDone?th.subtext:th.gold,flexShrink:0}}>+{o.pts} pts</div>
                </div>
              );
            })}
            <div style={{borderTop:"1px solid "+th.border,marginTop:"10px",paddingTop:"8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:"11px",color:th.subtext}}>{quetes.filter(o=>done.includes(o.id)).length}/{quetes.length} complétés</span>
              <span style={{fontSize:"13px",fontWeight:"bold",color:th.gold}}>🏆 {modePts} / {maxPts} pts</span>
            </div>
          </div>
          <div style={{background:dark?"rgba(39,174,96,0.08)":"rgba(39,174,96,0.05)",border:"1px solid #27ae60",borderRadius:"10px",padding:"8px 14px",marginBottom:"10px",fontSize:"11px",color:"#27ae60"}}>
            🌐 Classement du jour — reset à minuit
          </div>
          <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"36px 1fr 80px",padding:"8px 10px",background:dark?"rgba(0,0,0,0.3)":"rgba(139,0,0,0.08)",fontSize:"9px",fontWeight:"bold",textTransform:"uppercase",letterSpacing:"1px",color:th.subtext}}>
              <span>#</span><span>Joueur</span><span style={{textAlign:"right"}}>Pts aujourd'hui</span>
            </div>
            {loadingDailyLB&&<div style={{padding:"20px",textAlign:"center",fontSize:"11px",color:th.subtext}}>⏳ Chargement...</div>}
            {!loadingDailyLB&&dailyLB.length===0&&<div style={{padding:"20px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>Aucun défi complété aujourd'hui — soyez le premier !</div>}
            {!loadingDailyLB&&dailyLB.map((s,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 80px",padding:"10px",borderTop:"1px solid "+th.border,alignItems:"center",background:i===0?(dark?"rgba(212,172,13,0.08)":"rgba(212,172,13,0.05)"):"transparent"}}>
                <span style={{fontSize:"16px"}}>{medals[i]||i+1}</span>
                <span style={{fontSize:"12px",fontWeight:"bold",color:i===0?th.gold:th.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.nom}</span>
                <span style={{fontSize:"12px",fontWeight:"bold",color:i===0?th.gold:th.accent,textAlign:"right"}}>{s.dailyPts||0}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ObjectifsPanel({progress,dark,th}){
  const [objMode,setObjMode]=useState("solo");
  const modeLabels={solo:"1 vs 1","4j":"1 vs 3",online:"En ligne"};
  const modeIcons={solo:"🏎️","4j":"🚗",online:"🌐"};

  const filtered=OBJECTIFS.filter(o=>
    objMode==="solo"?(o.mode==="solo"||o.mode===null):
    objMode==="4j"?(o.mode==="4j"||o.mode===null):
    false
  );
  const cats=[...new Set(filtered.map(o=>o.cat))];
  const unlocked=progress.unlocked||[];
  const doneCount=filtered.filter(o=>unlocked.includes(o.id)).length;

  return(
    <div>
      <div style={{display:"flex",gap:"4px",marginBottom:"12px"}}>
        {["solo","4j","online"].map(m=>(
          <button key={m} onClick={()=>setObjMode(m)} style={{flex:1,padding:"8px",border:"2px solid "+(objMode===m?th.title:th.border),borderRadius:"10px",background:objMode===m?(dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.08)"):"transparent",color:objMode===m?th.title:th.subtext,fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold",cursor:"pointer"}}>
            {modeIcons[m]} {modeLabels[m]}
          </button>
        ))}
      </div>
      {objMode==="online"?(
        <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",padding:"30px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>🌐 Mode En ligne — Bientôt disponible</div>
      ):(
        <>
          <div style={{fontSize:"11px",color:th.subtext,marginBottom:"10px",textAlign:"right"}}>{doneCount}/{filtered.length} débloqués</div>
          {cats.map(cat=>(
            <div key={cat} style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",overflow:"hidden",marginBottom:"10px"}}>
              <div style={{padding:"8px 14px",background:dark?"rgba(0,0,0,0.3)":"rgba(139,0,0,0.06)",fontSize:"11px",fontWeight:"bold",color:th.title}}>{cat}</div>
              {filtered.filter(o=>o.cat===cat).map(o=>{
                const done=unlocked.includes(o.id);
                const isCommon=o.mode===null;
                return(
                  <div key={o.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 14px",borderTop:"1px solid "+th.border,opacity:done?1:0.55}}>
                    <div style={{fontSize:"20px",flexShrink:0}}>{done?"✅":"🔒"}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"2px"}}>
                        <span style={{fontSize:"12px",fontWeight:"bold",color:done?th.gold:th.text}}>{o.label}</span>
                        {isCommon&&<span style={{fontSize:"8px",background:dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.08)",color:th.subtext,borderRadius:"4px",padding:"1px 5px"}}>Tous modes</span>}
                      </div>
                      <div style={{fontSize:"10px",color:th.subtext}}>{o.desc}</div>
                    </div>
                    <div style={{fontSize:"11px",fontWeight:"bold",color:done?th.gold:th.subtext,flexShrink:0}}>+{o.pts} pts</div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StatsPanel({progress,dark,th}){
  const [statMode,setStatMode]=useState("solo");
  const s=statMode==="solo"?(progress.stats_solo||{}):statMode==="4j"?(progress.stats_4j||{}):(progress.stats_online||{});
  const modeLabels={solo:"1 vs 1","4j":"1 vs 3",online:"En ligne"};
  const modeIcons={solo:"🏎️","4j":"🚗",online:"🌐"};
  return(
    <div>
      <div style={{display:"flex",gap:"4px",marginBottom:"12px"}}>
        {["solo","4j","online"].map(m=>(
          <button key={m} onClick={()=>setStatMode(m)} style={{flex:1,padding:"8px",border:"2px solid "+(statMode===m?th.title:th.border),borderRadius:"10px",background:statMode===m?(dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.08)"):"transparent",color:statMode===m?th.title:th.subtext,fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold",cursor:"pointer"}}>
            {modeIcons[m]} {modeLabels[m]}
          </button>
        ))}
      </div>
      {statMode==="online"?(
        <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",padding:"30px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>🌐 Mode En ligne — Bientôt disponible</div>
      ):(s.played||0)===0?(
        <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",padding:"30px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>Aucune stat — jouez votre première course en mode {modeLabels[statMode]} !</div>
      ):(
        <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",overflow:"hidden"}}>
          {[
            {icon:"🏆",label:"Taux de victoire",value:(s.played>0?Math.round((s.wins||0)/s.played*100):0)+"%",sub:(s.wins||0)+" victoire"+((s.wins||0)>1?"s":"")+" sur "+(s.played||0)+" course"+((s.played||0)>1?"s":""),color:th.gold},
            {icon:"🛣️",label:"Kilomètres totaux",value:((s.totalKm||0)).toLocaleString()+" km",sub:"Moyenne : "+Math.round((s.totalKm||0)/Math.max(1,s.played||1))+" km/course",color:th.accent},
            {icon:"🃏",label:"Courses jouées",value:s.played||0,sub:"",color:th.subtext},
            {icon:"⭐",label:"Meilleur score",value:((s.bestScore||0)).toLocaleString()+" pts",sub:"",color:dark?"#e07070":"#8B0000"},
            {icon:"🔥",label:"Win streak max",value:s.winStreak||0,sub:"",color:"#e67e22"},
            {icon:"🎯",label:"Objectifs débloqués",value:progress.unlocked.length+" / "+OBJECTIFS.length,sub:progress.objPts+" pts",color:"#27ae60"},
          ].map(stat=>(
            <div key={stat.label} style={{display:"flex",alignItems:"center",gap:"14px",padding:"12px 16px",borderBottom:"1px solid "+th.border}}>
              <div style={{fontSize:"24px",flexShrink:0}}>{stat.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:"11px",color:th.subtext,marginBottom:"2px"}}>{stat.label}</div>
                <div style={{fontSize:"18px",fontWeight:"bold",color:stat.color}}>{stat.value}</div>
                {stat.sub&&<div style={{fontSize:"10px",color:th.subtext,marginTop:"1px"}}>{stat.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HomePage({dark,setDark,onPlay,onPlay4J,progress,soundOn,setSoundOn,userButton,pseudo,avatar,onChangePseudo}){
  const [tab,setTab]=useState("scores");
  const [selectedMode,setSelectedMode]=useState("solo");
  const [nom,setNom]=useState(progress.playerName||"");
  const [leaderboard,setLeaderboard]=useState([]);
  const [loadingLB,setLoadingLB]=useState(false);
  const [dailyLB,setDailyLB]=useState([]);
  const [loadingDailyLB,setLoadingDailyLB]=useState(false);
  const dailyObjectifs=getDailyObjectifs(); // {solo:[...], "4j":[...]}
  const dailyKey=getDailyKey();
  const dailyDone=progress.dailyDone||{};
  const allDailyIds=[...(dailyObjectifs.solo||[]),...(dailyObjectifs["4j"]||[])].map(o=>o.id);
  const dailyPts=allDailyIds.filter(id=>(dailyDone[dailyKey]||[]).includes(id)).reduce((s,id)=>{const o=DAILY_POOL.find(x=>x.id===id);return s+(o?o.pts:0);},0);
  const th={
    bg:dark?"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)":"linear-gradient(135deg,#fdf6e3 0%,#fae8c0 100%)",
    text:dark?"#e8e0d0":"#2c1810",subtext:dark?"#a89880":"#5d4037",border:dark?"#445566":"#a0856a",
    cardBg:dark?"rgba(30,40,60,0.85)":"rgba(255,255,255,0.7)",
    title:dark?"#e07070":"#8B0000",accent:dark?"#4a9eda":"#1a5276",gold:"#d4ac0d",
    barBg:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.08)",
  };
  const modes=[
    {id:"solo",emoji:"🧍",label:"Solo vs Victor",desc:"1 joueur contre l'IA",active:true},
    {id:"4j",emoji:"🏎️🚗🚕",label:"1 vs 3 IA",desc:"Toi contre Victor, Salomé & Raquel",active:true},
    {id:"online",emoji:"🌐",label:"En ligne",desc:"Joueurs du monde entier",active:false},
  ];
  const medals=["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
  const cats=[...new Set(OBJECTIFS.map(o=>o.cat))];

  useEffect(()=>{
    if(tab!=="scores")return;
    setLoadingLB(true);
    sharedGetLeaderboard().then(records=>{
      setLeaderboard(records);
      setLoadingLB(false);
    }).catch(()=>setLoadingLB(false));
  },[tab]);

  useEffect(()=>{
    if(tab!=="daily")return;
    setLoadingDailyLB(true);
    sharedGetLeaderboard().then(records=>{
      // Filtre sur dailyPts du jour courant
      const key=getDailyKey();
      const withDaily=records
        .filter(r=>r.dailyKey===key&&(r.dailyPts||0)>0)
        .sort((a,b)=>(b.dailyPts||0)-(a.dailyPts||0));
      setDailyLB(withDaily);
      setLoadingDailyLB(false);
    }).catch(()=>setLoadingDailyLB(false));
  },[tab]);

  // Inclure le joueur local s'il n'est pas dans le classement partagé
  const displayedScores = leaderboard.length > 0
    ? leaderboard
    : (progress.objPts > 0
        ? [{nom: progress.playerName||"Vous", objPts: progress.objPts, manchesPlayed: progress.manchesPlayed, wins: progress.wins}]
        : []);

  return(
    <div style={{fontFamily:"Georgia,serif",background:th.bg,minHeight:"100vh",color:th.text,boxSizing:"border-box"}}>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}.float{animation:float 3s ease-in-out infinite}`}</style>

      {/* HEADER */}
      <div style={{background:dark?"rgba(0,0,0,0.4)":"rgba(139,0,0,0.08)",borderBottom:"2px solid "+th.border,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span className="float" style={{fontSize:"28px"}}>🚗</span>
          <div>
            <div style={{fontSize:"20px",fontWeight:"bold",color:th.title,letterSpacing:"3px",textTransform:"uppercase"}}>{GAME_NAME}</div>
            <div style={{fontSize:"9px",color:th.subtext,letterSpacing:"2px"}}>v{VERSION}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          {progress.objPts>0&&<div style={{background:dark?"rgba(212,172,13,0.15)":"rgba(212,172,13,0.1)",border:"2px solid "+th.gold,borderRadius:"20px",padding:"4px 12px",fontSize:"11px",fontWeight:"bold",color:th.gold}}>🏆 {progress.objPts} pts</div>}
          {pseudo&&<button onClick={onChangePseudo} style={{background:dark?"rgba(255,255,255,0.08)":"rgba(139,0,0,0.08)",border:"2px solid "+(dark?"#445566":"#a0856a"),borderRadius:"20px",padding:"4px 14px",cursor:"pointer",color:dark?"#e8e0d0":"#2c1810",fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold"}}>{avatar||"🧑"} {pseudo} ✏️</button>}
          {userButton&&<div>{userButton}</div>}
          <button onClick={()=>setSoundOn(v=>!v)} style={{background:dark?"rgba(255,255,255,0.1)":"rgba(139,0,0,0.1)",border:"2px solid "+th.border,borderRadius:"8px",padding:"6px 10px",cursor:"pointer",fontSize:"16px"}}>{soundOn?"🔊":"🔇"}</button>
          <button onClick={()=>setDark(v=>!v)} style={{background:dark?"rgba(255,255,255,0.1)":"rgba(139,0,0,0.1)",border:"2px solid "+th.border,borderRadius:"8px",padding:"6px 10px",cursor:"pointer",fontSize:"16px"}}>{dark?"☀️":"🌙"}</button>
        </div>
      </div>

      <div style={{maxWidth:"800px",margin:"0 auto",padding:"20px 16px"}}>
        {/* HERO */}
        <div style={{textAlign:"center",marginBottom:"24px",padding:"24px",background:dark?"rgba(139,0,0,0.15)":"rgba(139,0,0,0.06)",borderRadius:"16px",border:"2px solid "+th.border}}>
          <div className="float" style={{fontSize:"52px",marginBottom:"8px"}}>🏁</div>
          <h1 style={{fontSize:"clamp(22px,5vw,32px)",fontWeight:"bold",color:th.title,letterSpacing:"4px",textTransform:"uppercase",margin:"0 0 6px 0"}}>{GAME_NAME}</h1>
          <p style={{fontSize:"13px",color:th.subtext,margin:"0 0 16px 0"}}>Le jeu de cartes de course — Soyez le premier à parcourir 1000 km !</p>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"10px"}}>
            <button onClick={()=>selectedMode==="4j"?onPlay4J&&onPlay4J():onPlay()} style={{background:"linear-gradient(135deg,#8B0000,#c0392b)",color:"#fff",border:"none",borderRadius:"12px",padding:"14px 40px",cursor:"pointer",fontWeight:"bold",letterSpacing:"2px",fontFamily:"Georgia,serif",fontSize:"16px",textTransform:"uppercase",boxShadow:"0 4px 16px rgba(139,0,0,0.4)"}}>▶️ Jouer !</button>
            <div style={{fontSize:"9px",color:th.subtext,opacity:0.7}}>☁️ Progression & classement synchronisés automatiquement</div>
          </div>
        </div>

        {/* MODES */}
        <div style={{marginBottom:"24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:"10px"}}>
            {modes.map(m=>(
              <div key={m.id} onClick={m.active?()=>setSelectedMode(m.id):undefined} style={{background:selectedMode===m.id?(dark?"rgba(139,0,0,0.2)":"rgba(139,0,0,0.08)"):th.cardBg,border:selectedMode===m.id?"3px solid "+(dark?"#e07070":"#8B0000"):"2px solid "+th.border,borderRadius:"12px",padding:"16px",textAlign:"center",opacity:m.active?1:0.45,position:"relative",cursor:m.active?"pointer":"not-allowed",transition:"all 0.2s"}}>
                {!m.active&&<div style={{position:"absolute",top:"8px",right:"8px",background:dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.08)",borderRadius:"6px",padding:"2px 6px",fontSize:"8px",fontWeight:"bold",color:th.subtext}}>BIENTÔT</div>}
                {m.id==="solo"
                  ?<div style={{marginBottom:"6px",lineHeight:0}}><svg viewBox="0 0 680 180" style={{width:"100%",maxHeight:"80px"}} role="img"><title>Solo vs Victor</title>
                    <rect x="0" y="0" width="680" height="100" fill="#e8f4fd"/>
                    <circle cx="580" cy="35" r="28" fill="#FFE066" opacity="0.9"/>
                    <circle cx="580" cy="35" r="22" fill="#FFD700"/>
                    <ellipse cx="150" cy="95" rx="200" ry="40" fill="#a8d5a2" opacity="0.7"/>
                    <ellipse cx="520" cy="98" rx="220" ry="35" fill="#b8e0b0" opacity="0.6"/>
                    <rect x="0" y="55" width="680" height="35" fill="#e8d5b0"/>
                    <rect x="0" y="55" width="680" height="4" fill="#c8a870"/>
                    <g><rect x="0" y="59" width="20" height="12" fill="#e63946"/><rect x="20" y="59" width="20" height="12" fill="white"/><rect x="40" y="59" width="20" height="12" fill="#e63946"/><rect x="60" y="59" width="20" height="12" fill="white"/><rect x="80" y="59" width="20" height="12" fill="#e63946"/><rect x="100" y="59" width="20" height="12" fill="white"/><rect x="120" y="59" width="20" height="12" fill="#e63946"/><rect x="140" y="59" width="20" height="12" fill="white"/><rect x="160" y="59" width="20" height="12" fill="#e63946"/><rect x="180" y="59" width="20" height="12" fill="white"/><rect x="200" y="59" width="20" height="12" fill="#e63946"/><rect x="220" y="59" width="20" height="12" fill="white"/><rect x="240" y="59" width="20" height="12" fill="#e63946"/><rect x="260" y="59" width="20" height="12" fill="white"/><rect x="280" y="59" width="20" height="12" fill="#e63946"/><rect x="300" y="59" width="20" height="12" fill="white"/><rect x="320" y="59" width="20" height="12" fill="#e63946"/><rect x="340" y="59" width="20" height="12" fill="white"/><rect x="360" y="59" width="20" height="12" fill="#e63946"/><rect x="380" y="59" width="20" height="12" fill="white"/><rect x="400" y="59" width="20" height="12" fill="#e63946"/><rect x="420" y="59" width="20" height="12" fill="white"/><rect x="440" y="59" width="20" height="12" fill="#e63946"/><rect x="460" y="59" width="20" height="12" fill="white"/><rect x="480" y="59" width="20" height="12" fill="#e63946"/><rect x="500" y="59" width="20" height="12" fill="white"/><rect x="520" y="59" width="20" height="12" fill="#e63946"/><rect x="540" y="59" width="20" height="12" fill="white"/><rect x="560" y="59" width="20" height="12" fill="#e63946"/><rect x="580" y="59" width="20" height="12" fill="white"/><rect x="600" y="59" width="20" height="12" fill="#e63946"/><rect x="620" y="59" width="20" height="12" fill="white"/><rect x="640" y="59" width="20" height="12" fill="#e63946"/><rect x="660" y="59" width="20" height="12" fill="white"/></g>
                    <rect x="0" y="100" width="680" height="70" fill="#6b6b6b"/>
                    <rect x="0" y="100" width="680" height="4" fill="#888"/>
                    <line x1="0" y1="135" x2="680" y2="135" stroke="#FFD700" strokeWidth="2" strokeDasharray="28,18" opacity="0.7"/>
                    <rect x="0" y="166" width="680" height="4" fill="#888"/>
                    <rect x="0" y="170" width="680" height="10" fill="#5a5a2a"/>
                    <g fill="black" opacity="0.55"><rect x="604" y="100" width="10" height="9"/><rect x="614" y="109" width="10" height="9"/><rect x="604" y="118" width="10" height="9"/><rect x="614" y="127" width="10" height="9"/><rect x="604" y="136" width="10" height="9"/><rect x="614" y="145" width="10" height="9"/><rect x="604" y="154" width="10" height="9"/><rect x="614" y="163" width="10" height="9"/></g>
                    <g fill="white" opacity="0.55"><rect x="614" y="100" width="10" height="9"/><rect x="604" y="109" width="10" height="9"/><rect x="614" y="118" width="10" height="9"/><rect x="604" y="127" width="10" height="9"/><rect x="614" y="136" width="10" height="9"/><rect x="604" y="145" width="10" height="9"/><rect x="614" y="154" width="10" height="9"/><rect x="604" y="163" width="10" height="9"/></g>
                    <line x1="624" y1="62" x2="624" y2="103" stroke="#333" strokeWidth="2.5"/>
                    <rect x="624" y="62" width="28" height="18" fill="white"/>
                    <rect x="624" y="62" width="9" height="9" fill="black"/><rect x="633" y="71" width="9" height="9" fill="black"/><rect x="642" y="62" width="10" height="9" fill="black"/>
                    <g transform="translate(460,0) scale(-1,1) translate(-460,0)"><text x="460" y="128" fontSize="36" textAnchor="middle">🏎️</text></g>
                    <ellipse cx="498" cy="119" rx="12" ry="5" fill="#ccc" opacity="0.4"/>
                    <ellipse cx="514" cy="117" rx="8" ry="3" fill="#ccc" opacity="0.2"/>
                    <g transform="translate(280,0) scale(-1,1) translate(-280,0)"><text x="280" y="160" fontSize="36" textAnchor="middle">🚗</text></g>
                    <ellipse cx="316" cy="152" rx="11" ry="5" fill="#ccc" opacity="0.35"/>
                    <rect x="316" y="118" width="46" height="22" rx="6" fill="#FFD700"/>
                    <text x="339" y="133" textAnchor="middle" fontFamily="Georgia,serif" fontSize="15" fill="#8B0000" fontWeight="bold">VS</text>
                  </svg></div>
                  :m.id==="4j"
                  ?<div style={{marginBottom:"6px",lineHeight:0}}><svg viewBox="0 0 680 180" style={{width:"100%",maxHeight:"80px"}} role="img"><title>Course 4 voitures</title>
                    <rect x="0" y="0" width="680" height="100" fill="#e8f4fd"/>
                    <circle cx="580" cy="35" r="28" fill="#FFE066" opacity="0.9"/>
                    <circle cx="580" cy="35" r="22" fill="#FFD700"/>
                    <ellipse cx="150" cy="95" rx="200" ry="40" fill="#a8d5a2" opacity="0.7"/>
                    <ellipse cx="520" cy="98" rx="220" ry="35" fill="#b8e0b0" opacity="0.6"/>
                    <rect x="0" y="55" width="680" height="35" fill="#e8d5b0"/>
                    <rect x="0" y="55" width="680" height="4" fill="#c8a870"/>
                    <g><rect x="0" y="59" width="20" height="12" fill="#e63946"/><rect x="20" y="59" width="20" height="12" fill="white"/><rect x="40" y="59" width="20" height="12" fill="#e63946"/><rect x="60" y="59" width="20" height="12" fill="white"/><rect x="80" y="59" width="20" height="12" fill="#e63946"/><rect x="100" y="59" width="20" height="12" fill="white"/><rect x="120" y="59" width="20" height="12" fill="#e63946"/><rect x="140" y="59" width="20" height="12" fill="white"/><rect x="160" y="59" width="20" height="12" fill="#e63946"/><rect x="180" y="59" width="20" height="12" fill="white"/><rect x="200" y="59" width="20" height="12" fill="#e63946"/><rect x="220" y="59" width="20" height="12" fill="white"/><rect x="240" y="59" width="20" height="12" fill="#e63946"/><rect x="260" y="59" width="20" height="12" fill="white"/><rect x="280" y="59" width="20" height="12" fill="#e63946"/><rect x="300" y="59" width="20" height="12" fill="white"/><rect x="320" y="59" width="20" height="12" fill="#e63946"/><rect x="340" y="59" width="20" height="12" fill="white"/><rect x="360" y="59" width="20" height="12" fill="#e63946"/><rect x="380" y="59" width="20" height="12" fill="white"/><rect x="400" y="59" width="20" height="12" fill="#e63946"/><rect x="420" y="59" width="20" height="12" fill="white"/><rect x="440" y="59" width="20" height="12" fill="#e63946"/><rect x="460" y="59" width="20" height="12" fill="white"/><rect x="480" y="59" width="20" height="12" fill="#e63946"/><rect x="500" y="59" width="20" height="12" fill="white"/><rect x="520" y="59" width="20" height="12" fill="#e63946"/><rect x="540" y="59" width="20" height="12" fill="white"/><rect x="560" y="59" width="20" height="12" fill="#e63946"/><rect x="580" y="59" width="20" height="12" fill="white"/><rect x="600" y="59" width="20" height="12" fill="#e63946"/><rect x="620" y="59" width="20" height="12" fill="white"/><rect x="640" y="59" width="20" height="12" fill="#e63946"/><rect x="660" y="59" width="20" height="12" fill="white"/></g>
                    <rect x="0" y="100" width="680" height="70" fill="#6b6b6b"/>
                    <rect x="0" y="100" width="680" height="4" fill="#888"/>
                    <line x1="0" y1="128" x2="680" y2="128" stroke="#FFD700" strokeWidth="1.5" strokeDasharray="25,18" opacity="0.5"/>
                    <line x1="0" y1="152" x2="680" y2="152" stroke="#FFD700" strokeWidth="1.5" strokeDasharray="25,18" opacity="0.5"/>
                    <rect x="0" y="166" width="680" height="4" fill="#888"/>
                    <rect x="0" y="170" width="680" height="10" fill="#5a5a2a"/>
                    <g fill="black" opacity="0.55"><rect x="604" y="100" width="10" height="9"/><rect x="614" y="109" width="10" height="9"/><rect x="604" y="118" width="10" height="9"/><rect x="614" y="127" width="10" height="9"/><rect x="604" y="136" width="10" height="9"/><rect x="614" y="145" width="10" height="9"/><rect x="604" y="154" width="10" height="9"/><rect x="614" y="163" width="10" height="9"/></g>
                    <g fill="white" opacity="0.55"><rect x="614" y="100" width="10" height="9"/><rect x="604" y="109" width="10" height="9"/><rect x="614" y="118" width="10" height="9"/><rect x="604" y="127" width="10" height="9"/><rect x="614" y="136" width="10" height="9"/><rect x="604" y="145" width="10" height="9"/><rect x="614" y="154" width="10" height="9"/><rect x="604" y="163" width="10" height="9"/></g>
                    <line x1="624" y1="62" x2="624" y2="103" stroke="#333" strokeWidth="2.5"/>
                    <rect x="624" y="62" width="28" height="18" fill="white"/>
                    <rect x="624" y="62" width="9" height="9" fill="black"/><rect x="633" y="71" width="9" height="9" fill="black"/><rect x="642" y="62" width="10" height="9" fill="black"/>
                    <g transform="translate(540,0) scale(-1,1) translate(-540,0)"><text x="540" y="122" fontSize="30" textAnchor="middle">🏎️</text></g>
                    <ellipse cx="574" cy="114" rx="9" ry="4" fill="#ccc" opacity="0.35"/>
                    <g transform="translate(400,0) scale(-1,1) translate(-400,0)"><text x="400" y="134" fontSize="27" textAnchor="middle">🚗</text></g>
                    <ellipse cx="430" cy="127" rx="8" ry="4" fill="#ccc" opacity="0.3"/>
                    <g transform="translate(260,0) scale(-1,1) translate(-260,0)"><text x="260" y="148" fontSize="25" textAnchor="middle">🚙</text></g>
                    <ellipse cx="288" cy="141" rx="7" ry="3" fill="#ccc" opacity="0.25"/>
                    <g transform="translate(120,0) scale(-1,1) translate(-120,0)"><text x="120" y="160" fontSize="23" textAnchor="middle">🚕</text></g>
                    <ellipse cx="146" cy="154" rx="6" ry="3" fill="#ccc" opacity="0.2"/>
                  </svg></div>
                  :<div style={{fontSize:"28px",marginBottom:"6px"}}>{m.emoji}</div>
                }
                <div style={{fontSize:"12px",fontWeight:"bold",color:m.active?th.title:th.subtext,marginBottom:"3px"}}>{m.label}</div>
                <div style={{fontSize:"10px",color:th.subtext}}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ONGLETS */}
        <div style={{marginBottom:"24px"}}>
          <div style={{display:"flex",gap:"4px",marginBottom:"12px",flexWrap:"wrap"}}>
            {[["scores","🏆 Classement"],["daily","📅 Journalier"],["objectifs","🎯 Objectifs"],["stats","📊 Stats"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,minWidth:"80px",padding:"8px",border:"2px solid "+(tab===id?th.title:th.border),borderRadius:"10px",background:tab===id?(dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.08)"):"transparent",color:tab===id?th.title:th.subtext,fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold",cursor:"pointer"}}>{lbl}</button>
            ))}
          </div>

          {tab==="scores"&&(
            <div>
              <div style={{background:dark?"rgba(39,174,96,0.08)":"rgba(39,174,96,0.05)",border:"1px solid #27ae60",borderRadius:"10px",padding:"8px 14px",marginBottom:"10px",fontSize:"11px",color:"#27ae60"}}>
                🌐 Classement global — partagé entre tous les joueurs de cet artifact
              </div>
              <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"12px",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 60px",padding:"8px 10px",background:dark?"rgba(0,0,0,0.3)":"rgba(139,0,0,0.08)",fontSize:"9px",fontWeight:"bold",textTransform:"uppercase",letterSpacing:"1px",color:th.subtext}}>
                  <span>#</span><span>Joueur</span><span style={{textAlign:"right"}}>Pts</span><span style={{textAlign:"right"}}>Wins</span>
                </div>
                {loadingLB&&<div style={{padding:"20px",textAlign:"center",fontSize:"11px",color:th.subtext}}>⏳ Chargement...</div>}
                {!loadingLB&&displayedScores.length===0&&<div style={{padding:"20px",textAlign:"center",fontSize:"11px",color:th.subtext,fontStyle:"italic"}}>Aucun score — soyez le premier !</div>}
                {!loadingLB&&displayedScores.map((s,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 60px",padding:"10px 10px",borderTop:"1px solid "+th.border,alignItems:"center",background:i===0?(dark?"rgba(212,172,13,0.08)":"rgba(212,172,13,0.05)"):"transparent"}}>
                    <span style={{fontSize:"16px"}}>{medals[i]||i+1}</span>
                    <span style={{fontSize:"12px",fontWeight:"bold",color:i===0?th.gold:th.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.nom}</span>
                    <span style={{fontSize:"12px",fontWeight:"bold",color:i===0?th.gold:th.accent,textAlign:"right"}}>{(s.objPts||0).toLocaleString()}</span>
                    <span style={{fontSize:"11px",color:th.subtext,textAlign:"right"}}>{s.wins||0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==="daily"&&<DailyPanel progress={progress} dark={dark} th={th} dailyObjectifs={dailyObjectifs} dailyKey={dailyKey} dailyDone={dailyDone} dailyLB={dailyLB} loadingDailyLB={loadingDailyLB} medals={medals}/>}
          {tab==="objectifs"&&<ObjectifsPanel progress={progress} dark={dark} th={th}/>}
          {tab==="stats"&&<StatsPanel progress={progress} dark={dark} th={th}/>}
        </div>
        <div style={{textAlign:"center",fontSize:"10px",color:th.subtext,opacity:0.6,paddingBottom:"20px"}}>🚗 {GAME_NAME} v{VERSION} — Multijoueur bientôt disponible</div>
      </div>
    </div>
  );
}

// ── GAME PAGE ──────────────────────────────────────────────────────────────────
function GamePage({dark,setDark,onBack,progress,setProgress,soundOn,setSoundOn}){
  const [playerName]=useState(progress.playerName||"Joueur");
  const [difficulty,setDifficulty]=useState("normal");
  const [hardcoreUnlocked,setHardcoreUnlocked]=useState(progress.unlocked.includes("win_hard"));
  const [showTirage,setShowTirage]=useState(true);
  const [tirageStep,setTirageStep]=useState(0);
  const [tirageAnim,setTirageAnim]=useState(false);
  const [des,setDes]=useState([1,1]);
  const [firstPlayer,setFirstPlayer]=useState("player");
  const [totalScore,setTotalScore]=useState({player:0,ai:0});
  const [manche,setManche]=useState(1);
  const [mancheResult,setMancheResult]=useState(null);
  const [gameOver,setGameOver]=useState(null);
  const [state,setState]=useState(()=>initManche("player","normal"));
  const [selected,setSelected]=useState(null);
  const [discardMode,setDiscardMode]=useState(false);
  const [animCard,setAnimCard]=useState(null);
  const [animDiscard,setAnimDiscard]=useState(null);
  const [isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<640);
  const [turnTime,setTurnTime]=useState(0);
  const [turnStart,setTurnStart]=useState(null);
  const [bestTime,setBestTime]=useState(null);
  const [displayedPlayerKm,setDisplayedPlayerKm]=useState(0);
  const [displayedAiKm,setDisplayedAiKm]=useState(0);
  const [showScoreInfo,setShowScoreInfo]=useState(false);
  const [objNotifs,setObjNotifs]=useState([]);
  const [mancheCFCount,setMancheCFCount]=useState(0);
  const [aiMaxKm,setAiMaxKm]=useState(0);
  const [discardCount,setDiscardCount]=useState(0);
  const [attackCount,setAttackCount]=useState(0);
  const [attackTypes,setAttackTypes]=useState(new Set());
  const [partieNb200,setPartieNb200]=useState(0);
  const [winStreak,setWinStreak]=useState(progress.winStreak||0);
  const [lastMancheZero,setLastMancheZero]=useState(false);

  const th={
    bg:dark?"linear-gradient(135deg,#1a1a2e 0%,#16213e 100%)":"linear-gradient(135deg,#fdf6e3 0%,#fae8c0 100%)",
    text:dark?"#e8e0d0":"#2c1810",subtext:dark?"#a89880":"#5d4037",border:dark?"#445566":"#a0856a",
    cardBg:dark?"rgba(30,40,60,0.9)":"rgba(255,255,255,0.6)",
    playerBd:dark?{background:"rgba(40,30,20,0.9)",border:"3px solid #c0392b",borderRadius:"12px",padding:"8px"}:{background:"rgba(255,255,200,0.8)",border:"3px solid #8B0000",borderRadius:"12px",padding:"8px"},
    aiBd:dark?{background:"rgba(20,30,50,0.7)",border:"2px solid #445566",borderRadius:"12px",padding:"8px"}:{background:"rgba(255,255,255,0.6)",border:"2px solid #a0856a",borderRadius:"12px",padding:"8px"},
    btn:(c)=>({background:c||"#8B0000",color:"#fff",border:"none",borderRadius:"8px",padding:"8px 14px",cursor:"pointer",fontWeight:"bold",letterSpacing:"1px",fontFamily:"Georgia,serif",fontSize:"11px",textTransform:"uppercase"}),
    modal:{background:dark?"#1e2a3a":"#fdf6e3",border:dark?"4px double #4a6fa5":"4px double #8B0000",borderRadius:"16px",padding:"20px",textAlign:"center",maxWidth:"340px",width:"90%",margin:"0 10px"},
    log:dark?"rgba(20,30,50,0.8)":"rgba(255,255,255,0.6)",logBorder:dark?"#334":"#e0d0b0",logText:dark?"#c8bfb0":"#3d2b1f",
    mainBg:dark?"rgba(10,20,40,0.6)":"rgba(26,82,118,0.05)",mainBorder:dark?"#334":"#a0856a",
    title:dark?"#e07070":"#8B0000",accent:dark?"#4a9eda":"#1a5276",
    playerBar:dark?"#e07070":"#8B0000",aiBar:dark?"#5b8dd9":"#445566",barBg:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.1)",
  };

  const dn=playerName||"Joueur";
  const mustDraw=state.phase==="play"&&!state.drawn&&state.turn==="player";
  const playerValid=state.phase==="play"&&state.drawn?getPlays(state,"player").map(p=>p.cardId):[];
  const isAiTurn=state.phase==="ai_turn";
  const isCF=state.phase==="coup_fourre";
  const cf=state.coupFourreAvailable;
  const lastDiscard=state.discard.length>0?state.discard[state.discard.length-1]:null;
  const mPS=calcScore(state.player,false,null);
  const mAS=calcScore(state.ai,false,null);
  const barW=pts=>Math.min(100,Math.round(pts/SCORE_CIBLE*100));
  const diffLabel=difficulty==="easy"?"😊":difficulty==="hard"?"🔥":difficulty==="hardcore"?"💀":"🎯";

  let statusMsg="";
  if(isAiTurn)statusMsg="⏳ Victor réfléchit...";
  else if(isCF&&cf&&cf.attackerWho==="ai")statusMsg="⚡ Coup-Fourré possible !";
  else if(mustDraw)statusMsg="👆 Piochez une carte";
  else if(discardMode&&selected)statusMsg="Confirmez la défausse";
  else if(discardMode)statusMsg="🗑️ Choisissez une carte";
  else if(state.drawn)statusMsg="🃏 Jouez ou défaussez";
  else statusMsg="Votre tour, "+dn;

  useEffect(()=>{const h=()=>setIsMobile(window.innerWidth<640);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  useEffect(()=>{const target=state.player.km;if(displayedPlayerKm===target)return;const iv=setInterval(()=>{setDisplayedPlayerKm(v=>{if(v===target){clearInterval(iv);return v;}const step=Math.max(1,Math.ceil(Math.abs(target-v)/15));return target>v?Math.min(v+step,target):Math.max(v-step,target);});},30);return()=>clearInterval(iv);},[state.player.km]);
  useEffect(()=>{const target=state.ai.km;if(displayedAiKm===target)return;const iv=setInterval(()=>{setDisplayedAiKm(v=>{if(v===target){clearInterval(iv);return v;}const step=Math.max(1,Math.ceil(Math.abs(target-v)/15));return target>v?Math.min(v+step,target):Math.max(v-step,target);});},30);return()=>clearInterval(iv);},[state.ai.km]);
  useEffect(()=>{if(state.phase==="play"&&state.drawn&&state.turn==="player"){const start=turnStart||Date.now();if(!turnStart)setTurnStart(start);const iv=setInterval(()=>setTurnTime(Math.floor((Date.now()-start)/1000)),500);return()=>clearInterval(iv);}else{setTurnStart(null);setTurnTime(0);}},[state.phase,state.drawn,state.turn]);
  useEffect(()=>{if(state.ai.km>aiMaxKm)setAiMaxKm(state.ai.km);},[state.ai.km]);

  function snd(type){playSound(type,soundOn);}
  function playAnim(id,from){setAnimCard({id,from});setTimeout(()=>setAnimCard(null),700);}
  function playDiscardAnim(id){setAnimDiscard(id);setTimeout(()=>setAnimDiscard(null),800);}

  function checkObjectifs(params){
    const{winner,playerState,aiState,diff,wins,manchesPlayed,cfCount}=params;
    const newUnlocked=[];const cur=progress.unlocked;
    const check=(id,cond)=>{if(!cur.includes(id)&&cond)newUnlocked.push(id);};
    check("first_win",winner==="player");check("win5",winner==="player"&&wins>=5);check("win10",winner==="player"&&wins>=10);
    check("win_hard",winner==="player"&&(diff==="hard"||diff==="hardcore"));check("win_hardcore",winner==="player"&&diff==="hardcore");
    check("no_block",winner==="player"&&!playerState.wasAttacked);check("no_200",winner==="player"&&!(playerState.bornes||[]).includes("b200"));
    check("capot",winner==="player"&&aiState.km===0);check("cf1",playerState.coupsFourres>=1);check("cf3",cfCount>=3);
    check("all_bottes",playerState.bottes.length>=4);check("no_attack",winner==="player"&&!playerState.wasAttacked);
    check("comeback",winner==="player"&&aiMaxKm>800);check("play10",manchesPlayed>=10);check("play50",manchesPlayed>=50);
    check("unlock_hardcore",hardcoreUnlocked);
    if(newUnlocked.length>0){
      const addedPts=newUnlocked.reduce((s,id)=>{const o=OBJECTIFS.find(x=>x.id===id);return s+(o?o.pts:0);},0);
      const notifs=newUnlocked.map(id=>OBJECTIFS.find(o=>o.id===id)).filter(Boolean);
      notifs.forEach((notif,i)=>{setTimeout(()=>{setObjNotifs([notif]);snd("obj");},i*3500);});
      setTimeout(()=>setObjNotifs([]),notifs.length*3500);
      setProgress(p=>({...p,unlocked:[...p.unlocked,...newUnlocked],objPts:p.objPts+addedPts}));
    }
  }

  function endManche(s){
    const w=checkWin(s);if(!w)return false;
    const ps=calcScore(s.player,w==="player",s.ai),as=calcScore(s.ai,w==="ai",s.player);
    const nt={player:totalScore.player+ps,ai:totalScore.ai+as};
    setTotalScore(nt);
    const newManchesPlayed=progress.manchesPlayed+1;
    const newWins=w==="player"?progress.wins+1:progress.wins;
    const newStreak=w==="player"?winStreak+1:0;
    setWinStreak(newStreak);
    // Hardcore se débloque en gagnant une partie complète (5000 pts)
    // Vérifié dans gameOver, pas ici
    const newTotalKm=(progress.totalKm||0)+s.player.km;
    const newBestManche=Math.max(progress.bestMancheScore||0,ps);
    const triedDiffs=new Set([...(progress.triedDifficulties||[]),difficulty]);
    setMancheResult({playerScore:ps,aiScore:as,winner:w,total:nt});
    setProgress(p=>{
      const prev=p.stats_solo||{};
      const newStrk=w==="player"?(prev.winStreak||0)+1:0;
      return{...p,
        manchesPlayed:newManchesPlayed,wins:newWins,totalKm:newTotalKm,bestMancheScore:newBestManche,winStreak:newStreak,triedDifficulties:[...triedDiffs],
        stats_solo:{wins:(prev.wins||0)+(w==="player"?1:0),played:(prev.played||0)+1,totalKm:(prev.totalKm||0)+s.player.km,bestScore:Math.max(prev.bestScore||0,ps),winStreak:Math.max(prev.winStreak||0,newStrk)}
      };
    });
    checkObjectifs({winner:w,playerState:{...s.player,startedLastMancheAtZero:lastMancheZero},aiState:s.ai,diff:difficulty,wins:newWins,manchesPlayed:newManchesPlayed,cfCount:mancheCFCount,streak:newStreak,mancheCount:manche,discardCount,attackCount,attackTypes,nbBottes200:partieNb200});
    // Objectifs journaliers
    setProgress(p=>{
      const daily=checkDailyObjectifs({winner:w,playerState:{...s.player},diff:difficulty,cfCount:mancheCFCount,discardCount,raceIndex:manche,attackTargets:[],kmLead:s.player.km-(s.ai?.km||0),mancheCount:manche},p);
      if(!daily)return p;
      const np={...p,dailyDone:daily.dailyDone,objPts:(p.objPts||0)+daily.addedPts,dailyWins:(p.dailyWins||0)+(w==="player"?1:0)};
      if(user)storageSavePlayer(user.id,pseudo,np);
      return np;
    });
    setLastMancheZero(s.player.km===0);
    if(nt.player>=SCORE_CIBLE||nt.ai>=SCORE_CIBLE){const winner=nt.player>=nt.ai?"player":"ai";const newHcu=!hardcoreUnlocked&&winner==="player";if(newHcu)setHardcoreUnlocked(true);setGameOver({winner,total:nt,newHardcore:newHcu});setTimeout(()=>snd(winner==="player"?"win":"lose"),300);}
    return true;
  }

  function handleDraw(){if(!mustDraw)return;if(state.deck.length===0&&state.discard.length===0){if(!endManche(state))setState({...state,phase:"play",drawn:true});return;}snd("draw");setState({...drawCard(state,"player"),drawn:true});setSelected(null);}
  function handleDiscard(id){if(!state.drawn||!id)return;playDiscardAnim(id);setDiscardCount(n=>n+1);let s=discardCard(state,"player",id,dn);if(!endManche(s)){s.turn="ai";s.drawn=false;s.phase="ai_turn";setState(s);}setSelected(null);setDiscardMode(false);}
  function handleCardClick(id){if(state.phase!=="play"||!state.drawn)return;snd("click");setSelected(prev=>prev===id?null:id);}
  function handlePlay(){if(!selected||state.phase!=="play")return;const c=getCard(selected);let action=null;if(c.type==="borne"&&canBorne(state.player,selected))action="borne";else if(c.type==="parade"&&canParade(state.player,selected))action="parade";else if(c.type==="attaque"&&canAttaque(state.ai,selected))action="attaque";else if(c.type==="botte")action="botte";if(!action)return;snd(action==="attaque"?"attack":action==="botte"?"cf":"play");playAnim(selected,"player");if(turnStart){const elapsed=(Date.now()-turnStart)/1000;if(!bestTime||elapsed<bestTime)setBestTime(elapsed);}setTurnStart(null);let s=applyPlay(state,"player",selected,action,dn);if(action==="attaque"){setAttackCount(n=>n+1);setAttackTypes(prev=>new Set([...prev,selected]));}if(action==="borne"&&selected==="b200")setPartieNb200(n=>n+1);if(action==="botte"&&s.player.coupsFourres>state.player.coupsFourres)setMancheCFCount(n=>n+1);if(action==="attaque"){const bo=botteFor(selected);if(bo&&s.ai.hand.some(x=>x===bo.id)){s.coupFourreAvailable={attaqueId:selected,botteId:bo.id,attackerWho:"player"};s.phase="coup_fourre";s.log.unshift({text:"⚡ Victor peut jouer un Coup-Fourré !",who:"system"});setState(s);setSelected(null);return;}}if(!endManche(s)){s.turn="ai";s.drawn=false;s.phase="ai_turn";setState(s);}setSelected(null);}
  function handleCF(accept){let s=JSON.parse(JSON.stringify(state));const botteId=s.coupFourreAvailable.botteId,attackerWho=s.coupFourreAvailable.attackerWho;const defWho=attackerWho==="player"?"ai":"player";if(accept){snd("cf");const def=s[defWho];const i=def.hand.indexOf(botteId);if(i!==-1)def.hand.splice(i,1);def.bottes.push(botteId);const boCo=Array.isArray(getCard(botteId).counters)?getCard(botteId).counters:[getCard(botteId).counters];if(def.attaque&&boCo.includes(def.attaque)){def.attaque=null;def.lastCard=def.started?"feu_vert":null;}if(botteId==="prioritaire"){def.limitee=false;def.lastLimite="fin_limite";}else if(!def.limitee){def.lastLimite=null;}def.coupsFourres=(def.coupsFourres||0)+1;if(defWho==="player")setMancheCFCount(n=>n+1);if(s.deck.length===0&&s.discard.length>0){s.deck=[...s.discard];s.discard=[];}if(defWho==="player"&&s.deck.length>0){s.player.hand.push(s.deck.shift());s.log.unshift({text:"🎁 Carte bonus (coup-fourré).",who:"system"});}if(defWho==="ai"&&s.deck.length>0)s.ai.hand.push(s.deck.shift());s.log.unshift({text:"⚡ COUP-FOURRÉ ! "+(defWho==="player"?dn:"Victor")+" neutralise avec "+getCard(botteId).label+" !",who:defWho});}s.coupFourreAvailable=null;s.turn=accept?defWho:(attackerWho==="player"?"ai":"player");s.phase=s.turn==="player"?"play":"ai_turn";s.drawn=false;setState(s);}
  function lancerDes(){setTirageAnim(true);let count=0;const iv=setInterval(()=>{const d1=Math.ceil(Math.random()*6),d2=Math.ceil(Math.random()*6);setDes([d1,d2]);count++;if(count>12){clearInterval(iv);setTirageAnim(false);setTirageStep(1);setDes(prev=>{const w=prev[0]>prev[1]?"player":prev[1]>prev[0]?"ai":"tie";if(w!=="tie"){setFirstPlayer(w);setState(initManche(w,difficulty));}return prev;});}},80);}
  function demarrerPartie(){setTirageStep(0);setShowTirage(false);setMancheCFCount(0);setAiMaxKm(0);setState(s=>({...initManche(firstPlayer,difficulty),phase:firstPlayer==="ai"?"ai_turn":"play"}));}
  function nouvellePartie(){setTotalScore({player:0,ai:0});setManche(1);setMancheResult(null);setGameOver(null);setTirageStep(0);setTirageAnim(false);setDes([1,1]);setFirstPlayer("player");setState(initManche("player",difficulty));setSelected(null);setDiscardMode(false);setDisplayedPlayerKm(0);setDisplayedAiKm(0);setMancheCFCount(0);setAiMaxKm(0);setDiscardCount(0);setAttackCount(0);setAttackTypes(new Set());setPartieNb200(0);setLastMancheZero(false);setShowTirage(true);}

  useEffect(()=>{if(state.phase!=="ai_turn")return;if(state.coupFourreAvailable&&state.coupFourreAvailable.attackerWho==="player"){const t=setTimeout(()=>handleCF(true),1200);return()=>clearTimeout(t);}const delay=difficulty==="hardcore"?600:1800;const t=setTimeout(()=>{let s=JSON.parse(JSON.stringify(state));if(s.deck.length===0&&s.discard.length===0){if(!endManche(s)){s.turn="player";s.drawn=false;s.phase="play";setState(s);}return;}s=drawCard(s,"ai");const plays=getPlays(s,"ai");const chosen=aiChoosePlay(plays,s,difficulty);if(chosen){if(chosen.action==="attaque")snd("attack");if(chosen.action==="botte")snd("cf");playAnim(chosen.cardId,"ai");s=applyPlay(s,"ai",chosen.cardId,chosen.action,dn);if(chosen.action==="attaque"){const bo=botteFor(chosen.cardId);if(bo&&s.player.hand.some(x=>x===bo.id)){s.coupFourreAvailable={attaqueId:chosen.cardId,botteId:bo.id,attackerWho:"ai"};s.phase="coup_fourre";s.turn="player";s.drawn=false;s.log.unshift({text:"⚡ Vous pouvez jouer un Coup-Fourré !",who:"system"});setState(s);return;}}}else{const td=aiChooseDiscard(s,difficulty);if(td){playDiscardAnim(td);s=discardCard(s,"ai",td,dn);}else s.log.unshift({text:"Victor passe son tour.",who:"ai"});}if(!endManche(s)){s.turn="player";s.drawn=false;s.phase="play";setState(s);}},delay);return()=>clearTimeout(t);},[state]);

  function renderActionButtons(mobile){
    const btnStyle=(color,small)=>({...th.btn(color),fontSize:small?"10px":"11px",padding:small?"6px 8px":"8px 14px"});
    return(
      <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap",marginTop:"0"}}>
        {!discardMode&&state.phase==="play"&&state.drawn&&selected&&playerValid.includes(selected)&&
          <button style={btnStyle("#27ae60",mobile)} onClick={handlePlay}>{mobile?"✅ Jouer":"✅ Jouer "+getCard(selected)?.label}</button>}
        {!discardMode&&state.phase==="play"&&state.drawn&&
          <button style={btnStyle("#7f8c8d",mobile)} onClick={()=>{setDiscardMode(true);setSelected(null);}}>🗑️ Défausser</button>}
        {discardMode&&selected&&<button style={btnStyle("#c0392b",mobile)} onClick={()=>handleDiscard(selected)}>🗑️ Jeter {getCard(selected)?.label}</button>}
        {discardMode&&<button style={btnStyle("#7f8c8d",mobile)} onClick={()=>{setDiscardMode(false);setSelected(null);}}>↩️ Annuler</button>}
      </div>
    );
  }

  function renderStatus(p){return(<div><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"5px",marginBottom:"3px"}}><div style={{width:isMobile?"38px":"46px",height:isMobile?"52px":"64px",borderRadius:"6px",border:"2px solid rgba(255,255,255,0.3)",background:(p.lastCard&&p.lastCard!=="limite"&&p.lastCard!=="fin_limite")?cColor(p.lastCard,dark):"rgba(128,128,128,0.15)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(p.lastCard&&p.lastCard!=="limite"&&p.lastCard!=="fin_limite")?<><div style={{fontSize:isMobile?"12px":"16px"}}>{cEmoji(p.lastCard)}</div><div style={{fontSize:"6px",color:"#fff",fontWeight:"bold",textAlign:"center",lineHeight:1.2}}>{getCard(p.lastCard)?.label}</div></>:<div style={{fontSize:"8px",color:"#aaa"}}>—</div>}</div><div style={{width:isMobile?"30px":"38px",height:isMobile?"44px":"52px",borderRadius:"5px",border:"2px solid rgba(255,255,255,0.2)",background:(p.lastLimite||(p.limitee?"limite":null))?cColor(p.lastLimite||"limite",dark):"rgba(128,128,128,0.08)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:(p.lastLimite||p.limitee)?1:0.3}}>{(p.lastLimite||p.limitee)?<><div style={{fontSize:"10px"}}>{cEmoji(p.lastLimite||"limite")}</div><div style={{fontSize:"5px",color:"#fff",fontWeight:"bold",textAlign:"center",lineHeight:1.2}}>{getCard(p.lastLimite||"limite")?.label}</div></>:<div style={{fontSize:"7px",color:"#aaa"}}>🐢</div>}</div><div style={{flex:1}}><div style={{fontSize:isMobile?"clamp(13px,3.5vw,18px)":"22px",fontWeight:"bold",color:th.accent,textAlign:"center"}}>{p.km} km</div><div style={{fontSize:isMobile?"clamp(8px,2.2vw,10px)":"11px",textAlign:"center"}}>{!p.started&&<span style={{color:"#c0392b",fontWeight:"bold"}}>🔴 Pas démarré</span>}{p.started&&!p.attaque&&!p.limitee&&<span style={{color:"#27ae60",fontWeight:"bold"}}>🟢 En route</span>}{p.attaque&&<span style={{color:"#c0392b",fontWeight:"bold"}}>⚠️ {getCard(p.attaque).label}</span>}{p.limitee&&<span style={{color:"#e67e22",fontWeight:"bold"}}> 🐢</span>}</div></div></div>{p.bottes.length>0&&(<div style={{display:"flex",gap:"4px",flexWrap:"wrap",justifyContent:"center",marginTop:"4px"}}>{p.bottes.map(b=><div key={b} style={{background:cColor(b,dark),color:"#fff",borderRadius:"6px",padding:"3px 6px",fontSize:"9px",fontWeight:"bold",display:"flex",alignItems:"center",gap:"3px"}}><span style={{fontSize:"12px"}}>{cEmoji(b)}</span><span style={{lineHeight:1.2}}>{getCard(b)?.label}</span></div>)}</div>)}</div>);}
  function renderCard(id,valid,sel,onClick){const c=getCard(id);return(<div key={id+"-"+Math.random()} style={{background:valid?cColor(id,dark):dark?"#3a3a4a":"#9e9e9e",color:"#fff",border:sel?"3px solid #FFD700":"2px solid rgba(255,255,255,0.2)",borderRadius:"8px",padding:"4px 2px",cursor:valid?"pointer":"not-allowed",fontSize:isMobile?"8px":"10px",fontWeight:"bold",width:isMobile?"calc(25% - 3px)":"72px",minWidth:isMobile?"56px":"72px",maxWidth:isMobile?"80px":"72px",height:isMobile?"70px":"80px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",opacity:valid?1:0.45,transform:sel?"translateY(-4px)":"none",transition:"transform 0.15s",wordBreak:"break-word",lineHeight:1.2,boxShadow:sel?"0 4px 12px rgba(255,215,0,0.4)":"none"}} onClick={onClick}><div style={{fontSize:isMobile?"13px":"15px",marginBottom:"1px"}}>{cEmoji(id)}</div><div style={{fontSize:isMobile?"7px":"9px",lineHeight:1.2}}>{c.label}</div>{c.km&&<div style={{fontSize:isMobile?"10px":"12px",fontWeight:"bold"}}>{c.km}</div>}</div>);}
  function renderPiocheDefausse(mobile){return(<><div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"10px",padding:mobile?"5px":"8px",textAlign:"center",minWidth:mobile?"60px":"80px",display:"flex",flexDirection:"column",justifyContent:"center"}}><div style={{fontSize:mobile?"16px":"20px"}}>🂠</div><div style={{fontSize:mobile?"11px":"13px",fontWeight:"bold",color:th.text}}>{state.deck.length}</div><div style={{fontSize:"8px",color:th.subtext}}>pioche</div>{mustDraw&&<button style={{...th.btn("#1a5276"),marginTop:"4px",padding:mobile?"3px 5px":"5px 8px",fontSize:mobile?"9px":"10px"}} onClick={handleDraw}>Piocher</button>}</div><div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"10px",padding:mobile?"5px":"8px",textAlign:"center",minWidth:mobile?"60px":"80px",display:"flex",flexDirection:"column",justifyContent:"center"}}>{lastDiscard?<><div style={{fontSize:mobile?"12px":"18px"}}>{cEmoji(lastDiscard)}</div><div style={{fontSize:mobile?"7px":"9px",fontWeight:"bold",color:cColor(lastDiscard,dark),lineHeight:1.2}}>{getCard(lastDiscard)?.label}</div></>:<div style={{fontSize:mobile?"14px":"20px",opacity:0.3}}>🂠</div>}<div style={{fontSize:mobile?"11px":"13px",fontWeight:"bold",color:th.text}}>{state.discard.length}</div><div style={{fontSize:"8px",color:th.subtext}}>défausse</div></div></>);}
  function renderLog(mobile){return(<div style={{flex:1,background:th.log,border:"2px solid "+th.border,borderRadius:"10px",padding:mobile?"7px":"10px",maxHeight:mobile?"130px":"200px",overflowY:"auto",minWidth:0}}><div style={{fontSize:mobile?"10px":"11px",fontWeight:"bold",marginBottom:"3px",textTransform:"uppercase",color:th.subtext}}>Journal</div>{state.log.map((l,i)=>{const ex=l.who==="player"?{background:dark?"rgba(180,60,60,0.15)":"rgba(255,255,200,0.6)",borderLeft:"3px solid "+(dark?"#c0392b":"#8B0000")}:l.who==="ai"?{background:dark?"rgba(60,80,120,0.3)":"rgba(210,210,210,0.5)",borderLeft:"3px solid "+(dark?"#4a6fa5":"#666")}:{background:"transparent",borderLeft:"3px solid transparent",fontStyle:"italic"};return <div key={i} style={{fontSize:"11px",borderBottom:"1px solid "+th.logBorder,padding:"3px 6px",color:th.logText,...ex}}>{l.text}</div>;})}</div>);}
  function renderScores(mobile){return(<div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"10px",padding:mobile?"7px":"10px",minWidth:mobile?"105px":"140px",flexShrink:0}}><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"5px",marginBottom:"4px"}}><div style={{fontSize:mobile?"10px":"12px",fontWeight:"bold",textTransform:"uppercase",color:th.subtext}}>Scores</div><button onClick={()=>setShowScoreInfo(true)} style={{width:"16px",height:"16px",borderRadius:"50%",border:"1px solid "+th.border,background:dark?"rgba(255,255,255,0.1)":"rgba(139,0,0,0.1)",color:th.subtext,fontSize:"10px",fontWeight:"bold",cursor:"pointer",lineHeight:"16px",padding:0,flexShrink:0,textAlign:"center"}}>i</button></div><div style={{fontSize:mobile?"8px":"9px",color:dark?"#778":"#888",textAlign:"center",marginBottom:"4px"}}>But : {SCORE_CIBLE}{!mobile?" pts":""}</div><div style={{marginBottom:mobile?"5px":"8px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:mobile?"9px":"11px",fontWeight:"bold",color:th.playerBar,marginBottom:"1px"}}><span>👤 {mobile?"":dn}</span><span>{totalScore.player}</span></div><div style={{height:mobile?"5px":"7px",background:th.barBg,borderRadius:"4px",overflow:"hidden"}}><div style={{height:"100%",width:barW(totalScore.player)+"%",background:th.playerBar,transition:"width 0.6s ease"}}/></div><div style={{fontSize:mobile?"7px":"9px",color:dark?"#778":"#999"}}>+{mPS} pts</div></div><div style={{marginBottom:"4px"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:mobile?"9px":"11px",fontWeight:"bold",color:th.aiBar,marginBottom:"1px"}}><span>🏎️ {mobile?"":"Victor"}</span><span>{totalScore.ai}</span></div><div style={{height:mobile?"5px":"7px",background:th.barBg,borderRadius:"4px",overflow:"hidden"}}><div style={{height:"100%",width:barW(totalScore.ai)+"%",background:th.aiBar,transition:"width 0.6s ease"}}/></div><div style={{fontSize:mobile?"7px":"9px",color:dark?"#778":"#999"}}>+{mAS} pts</div></div><div style={{borderTop:"1px solid "+th.border,paddingTop:"3px",fontSize:mobile?"7px":"9px",color:dark?"#d4ac0d":"#7d6608",textAlign:"center"}}>{SCORE_CIBLE-Math.max(totalScore.player,totalScore.ai)} restants</div></div>);}
  function renderMain(mobile){return(<div style={{background:th.mainBg,border:"2px dashed "+th.mainBorder,borderRadius:"10px",padding:mobile?"6px":"10px",width:mobile?"100%":"340px",flexShrink:0}}><div style={{fontSize:mobile?"10px":"12px",fontWeight:"bold",marginBottom:mobile?"5px":"8px",textTransform:"uppercase",color:th.subtext}}>{discardMode?"🗑️ Choisir carte":"Main"} ({state.player.hand.length})</div><div style={{display:"flex",gap:mobile?"3px":"5px",flexWrap:"wrap"}}>{state.player.hand.map(id=>{const v=!discardMode&&state.drawn&&playerValid.includes(id);const highlight=discardMode?true:v;return renderCard(id,highlight,selected===id,()=>handleCardClick(id));})}</div></div>);}
  function renderKmBar(){const pPct=Math.min(100,(displayedPlayerKm/1000)*100);const aPct=Math.min(100,(displayedAiKm/1000)*100);return(<div style={{marginBottom:"6px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}><span style={{fontSize:"9px",fontWeight:"bold",color:th.playerBar}}>👤 {dn} — {state.player.km} km</span><span style={{fontSize:"9px",fontWeight:"bold",color:th.aiBar}}>🏎️ Victor — {state.ai.km} km</span></div><div style={{height:"12px",background:th.barBg,borderRadius:"6px",overflow:"hidden",border:"1px solid "+th.border,marginBottom:"3px",position:"relative"}}><div style={{height:"100%",width:pPct+"%",background:"linear-gradient(90deg,"+th.playerBar+","+th.playerBar+"cc)",borderRadius:"6px",transition:"width 0.05s linear",boxShadow:dark?"0 0 6px rgba(224,112,112,0.5)":"none"}}/>{[200,400,600,800].map(v=><div key={v} style={{position:"absolute",top:0,bottom:0,left:(v/1000*100)+"%",width:"1px",background:dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}}/>)}</div><div style={{height:"12px",background:th.barBg,borderRadius:"6px",overflow:"hidden",border:"1px solid "+th.border,marginBottom:"2px",position:"relative"}}><div style={{height:"100%",width:aPct+"%",background:"linear-gradient(90deg,"+th.aiBar+","+th.aiBar+"cc)",borderRadius:"6px",transition:"width 0.05s linear",boxShadow:dark?"0 0 6px rgba(91,141,217,0.5)":"none"}}/>{[200,400,600,800].map(v=><div key={v} style={{position:"absolute",top:0,bottom:0,left:(v/1000*100)+"%",width:"1px",background:dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.1)"}}/>)}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:"8px",color:th.subtext}}>{[0,200,400,600,800,1000].map(v=><span key={v}>{v}</span>)}</div></div>);}

  const mdlOverlay={position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,"+(dark?"0.85":"0.7")+")",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100};

  return(
    <div style={{fontFamily:"Georgia,serif",background:th.bg,minHeight:"100vh",padding:"8px",color:th.text,overflowX:"hidden",boxSizing:"border-box",transition:"background 0.4s,color 0.4s"}}>
      <style>{`@keyframes flyUp{0%{transform:translateY(100px) scale(0.6);opacity:0}40%{opacity:1}70%{transform:translateY(-15px) scale(1.2);opacity:1}100%{transform:translateY(0) scale(1);opacity:0}}@keyframes flyDown{0%{transform:translateY(-100px) scale(0.6);opacity:0}40%{opacity:1}70%{transform:translateY(15px) scale(1.2);opacity:1}100%{transform:translateY(0) scale(1);opacity:0}}@keyframes toDiscard{0%{transform:translate(-50%,-50%) scale(1.4);opacity:1}60%{opacity:1}100%{transform:translate(-50%,-50%) scale(0.15);opacity:0}}@keyframes objIn{0%{transform:translate(-50%,-50%) scale(0.3) rotate(-5deg);opacity:0}60%{transform:translate(-50%,-50%) scale(1.05) rotate(1deg);opacity:1}75%{transform:translate(-50%,-50%) scale(0.98);opacity:1}85%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(0.8);opacity:0}}.fly-up{animation:flyUp 0.7s ease forwards}.fly-down{animation:flyDown 0.7s ease forwards}.to-discard{animation:toDiscard 0.8s ease forwards}`}</style>

      {/* NOTIF OBJECTIF */}
      {objNotifs.length>0&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:400,background:"rgba(0,0,0,0.45)"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",width:"min(340px,85vw)",textAlign:"center",transform:"translate(-50%,-50%)"}}>
            <div style={{background:"linear-gradient(135deg,#1a1200,#3a2800)",border:"3px solid #d4ac0d",borderRadius:"20px",padding:"28px 24px",boxShadow:"0 0 60px rgba(212,172,13,0.6),0 20px 60px rgba(0,0,0,0.7)"}}>
              <div style={{fontSize:"40px",marginBottom:"8px"}}>⭐</div>
              <div style={{fontSize:"11px",fontWeight:"bold",textTransform:"uppercase",letterSpacing:"3px",color:"#d4ac0d",marginBottom:"8px"}}>Objectif débloqué !</div>
              <div style={{fontSize:"22px",fontWeight:"bold",color:"#fff",marginBottom:"6px",lineHeight:1.2}}>{objNotifs[0].label}</div>
              <div style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",marginBottom:"16px"}}>{objNotifs[0].desc}</div>
              <div style={{background:"rgba(212,172,13,0.2)",border:"2px solid #d4ac0d",borderRadius:"12px",padding:"10px 20px",display:"inline-block"}}>
                <span style={{fontSize:"28px",fontWeight:"bold",color:"#f0c040"}}>+{objNotifs[0].pts}</span>
                <span style={{fontSize:"14px",color:"#d4ac0d",marginLeft:"4px"}}>pts</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{display:"flex",gap:"6px",marginBottom:"6px",alignItems:"center"}}>
        <button onClick={onBack} style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"12px",cursor:"pointer",color:th.subtext,fontFamily:"Georgia,serif",whiteSpace:"nowrap"}}>← Accueil</button>
        <div style={{flex:1,textAlign:"center",padding:"5px",background:dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.1)",borderRadius:"8px",fontWeight:"bold",fontSize:"clamp(9px,3vw,12px)",color:th.text}}>{statusMsg}</div>
        {state.phase==="play"&&state.drawn&&state.turn==="player"&&(<div style={{background:turnTime>20?"rgba(192,57,43,0.25)":turnTime>10?"rgba(230,126,34,0.2)":dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+(turnTime>20?"#c0392b":turnTime>10?"#e67e22":th.border),borderRadius:"8px",padding:"4px 8px",fontSize:"13px",fontWeight:"bold",color:turnTime>20?"#c0392b":turnTime>10?"#e67e22":th.subtext,whiteSpace:"nowrap",minWidth:"48px",textAlign:"center"}}>⏱ {turnTime}s</div>)}
        {bestTime&&<div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"clamp(8px,2vw,10px)",color:dark?"#d4ac0d":"#7d6608",whiteSpace:"nowrap"}}>🏅 {bestTime.toFixed(1)}s</div>}
        <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"clamp(9px,3vw,12px)",fontWeight:"bold",color:th.subtext,whiteSpace:"nowrap"}}>C.{manche}</div>
        <div style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"clamp(9px,3vw,12px)",fontWeight:"bold",whiteSpace:"nowrap",color:difficulty==="easy"?"#27ae60":difficulty==="hard"?"#e07070":difficulty==="hardcore"?"#ff6b6b":"#e67e22"}}>{diffLabel}</div>
        <button onClick={()=>setSoundOn(v=>!v)} style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"14px",cursor:"pointer",lineHeight:1}}>{soundOn?"🔊":"🔇"}</button>
        <button onClick={()=>setDark(v=>!v)} style={{background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px",fontSize:"14px",cursor:"pointer",lineHeight:1}}>{dark?"☀️":"🌙"}</button>
      </div>

      {renderKmBar()}

      {isMobile&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"6px"}}>
            <div style={!isAiTurn?th.playerBd:th.aiBd}><div style={{fontWeight:"bold",fontSize:"10px",marginBottom:"3px",textAlign:"center",color:th.text}}>👤 {dn.toUpperCase()}</div>{renderStatus(state.player)}</div>
            <div style={isAiTurn?th.playerBd:th.aiBd}><div style={{fontWeight:"bold",fontSize:"10px",marginBottom:"3px",textAlign:"center",color:th.text}}>🏎️ VICTOR</div>{renderStatus(state.ai)}</div>
          </div>
          <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"6px"}}>{renderPiocheDefausse(true)}<div style={{flex:1}}>{renderActionButtons(true)}</div></div>
          <div style={{marginBottom:"6px"}}>{renderMain(true)}</div>
          <div style={{display:"flex",gap:"6px",marginBottom:"60px"}}>{renderLog(true)}{renderScores(true)}</div>
        </div>
      )}

      {!isMobile&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto 1fr",gap:"10px",marginBottom:"10px",alignItems:"stretch"}}>
            <div style={!isAiTurn?th.playerBd:th.aiBd}><div style={{fontWeight:"bold",fontSize:"13px",marginBottom:"6px",textAlign:"center",letterSpacing:"2px",color:th.text}}>👤 {dn.toUpperCase()}</div>{renderStatus(state.player)}</div>
            {renderPiocheDefausse(false)}
            <div style={isAiTurn?th.playerBd:th.aiBd}><div style={{fontWeight:"bold",fontSize:"13px",marginBottom:"6px",textAlign:"center",letterSpacing:"2px",color:th.text}}>🏎️ VICTOR</div>{renderStatus(state.ai)}</div>
          </div>
          <div style={{display:"flex",gap:"10px",marginBottom:"10px",alignItems:"stretch"}}>{renderMain(false)}{renderLog(false)}{renderScores(false)}</div>
          <div style={{marginBottom:"10px"}}>{renderActionButtons(false)}</div>
        </div>
      )}

      {animCard&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:90,display:"flex",alignItems:"center",justifyContent:"center"}}><div className={animCard.from==="player"?"fly-up":"fly-down"} style={{background:cColor(animCard.id,dark),color:"#fff",borderRadius:"12px",padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",border:"3px solid rgba(255,255,255,0.4)",minWidth:"90px"}}><div style={{fontSize:"28px",marginBottom:"4px"}}>{cEmoji(animCard.id)}</div><div style={{fontSize:"12px",fontWeight:"bold",lineHeight:1.2}}>{getCard(animCard.id)?.label}</div></div></div>)}
      {animDiscard&&(<div style={{position:"fixed",top:"50%",left:"50%",pointerEvents:"none",zIndex:91}}><div className="to-discard" style={{background:cColor(animDiscard,dark),color:"#fff",borderRadius:"12px",padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",border:"3px solid rgba(255,255,255,0.4)",minWidth:"90px"}}><div style={{fontSize:"28px",marginBottom:"4px"}}>{cEmoji(animDiscard)}</div><div style={{fontSize:"12px",fontWeight:"bold",lineHeight:1.2}}>{getCard(animDiscard)?.label}</div></div></div>)}

      {gameOver&&gameOver.winner==="player"&&(<canvas style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:99}} ref={el=>{if(!el)return;const ctx=el.getContext("2d");el.width=window.innerWidth;el.height=window.innerHeight;const parts=Array.from({length:120},()=>({x:Math.random()*el.width,y:-20,r:Math.random()*5+3,color:["#8B0000","#FFD700","#1a5276","#27ae60","#e67e22"][Math.floor(Math.random()*5)],tA:0,tS:Math.random()*0.1+0.05,sp:Math.random()*3+1}));let fr;function draw(){ctx.clearRect(0,0,el.width,el.height);parts.forEach(p=>{p.tA+=p.tS;p.y+=p.sp;p.x+=Math.sin(p.tA)*2;if(p.y>el.height){p.y=-10;p.x=Math.random()*el.width;}ctx.beginPath();ctx.lineWidth=p.r;ctx.strokeStyle=p.color;ctx.moveTo(p.x+Math.sin(p.tA)*8,p.y);ctx.lineTo(p.x,p.y+p.r*2);ctx.stroke();});fr=requestAnimationFrame(draw);}draw();setTimeout(()=>cancelAnimationFrame(fr),8000);}}/>)}

      {showScoreInfo&&(<div style={{...mdlOverlay,zIndex:200}} onClick={()=>setShowScoreInfo(false)}><div style={{...th.modal,textAlign:"left"}} onClick={e=>e.stopPropagation()}><h2 style={{color:th.title,fontSize:"15px",marginBottom:"12px",textAlign:"center"}}>📋 Calcul des points</h2>{[["🛣️","Kilomètres parcourus","1 pt / km"],["🏁","Victoire (1er à 1000 km)","+400 pts"],["⭐","Botte jouée","+100 pts chacune"],["⚡","Coup-Fourré réussi","+300 pts"]].map(([e,l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+th.logBorder}}><span style={{fontSize:"11px",color:th.text}}>{e} {l}</span><span style={{fontSize:"11px",fontWeight:"bold",color:th.accent,whiteSpace:"nowrap",marginLeft:"8px"}}>{v}</span></div>))}<div style={{fontSize:"11px",color:th.subtext,marginBottom:"6px",marginTop:"10px",fontWeight:"bold",textTransform:"uppercase",letterSpacing:"1px"}}>Bonus spéciaux</div>{[["🎯","Sans 200 km","+300 pts","Gagner sans jouer de carte 200 km"],["💀","Capot","+500 pts","L'adversaire termine à 0 km"]].map(([e,l,v,d])=>(<div key={l} style={{padding:"5px 0",borderBottom:"1px solid "+th.logBorder}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"11px",color:th.text,fontWeight:"bold"}}>{e} {l}</span><span style={{fontSize:"11px",fontWeight:"bold",color:"#27ae60",whiteSpace:"nowrap",marginLeft:"8px"}}>{v}</span></div><div style={{fontSize:"9px",color:th.subtext,marginTop:"1px"}}>{d}</div></div>))}<div style={{marginTop:"10px",padding:"8px",background:dark?"rgba(255,215,0,0.1)":"rgba(139,0,0,0.07)",borderRadius:"8px",textAlign:"center"}}><span style={{fontSize:"12px",fontWeight:"bold",color:th.title}}>🏁 Objectif : {SCORE_CIBLE} pts</span></div><button style={{...th.btn(),marginTop:"12px",width:"100%",fontSize:"12px"}} onClick={()=>setShowScoreInfo(false)}>Fermer</button></div></div>)}

      {isCF&&cf&&(<div style={mdlOverlay}><div style={th.modal}><div style={{fontSize:"28px",marginBottom:"6px"}}>⚡</div><h2 style={{color:th.title,marginBottom:"10px",fontSize:"16px"}}>COUP-FOURRÉ !</h2>{cf.attackerWho==="ai"?(<div><p style={{fontSize:"11px",marginBottom:"14px",color:th.text}}>Victor vous attaque avec <strong>{getCard(cf.attaqueId)?.label}</strong>.<br/>Vous avez <strong>{getCard(cf.botteId)?.label}</strong> !</p><div style={{display:"flex",gap:"10px",justifyContent:"center"}}><button style={th.btn("#27ae60")} onClick={()=>handleCF(true)}>⚡ Coup-Fourré !</button><button style={th.btn("#7f8c8d")} onClick={()=>handleCF(false)}>Ignorer</button></div></div>):(<div><p style={{fontSize:"11px",marginBottom:"14px",color:th.text}}>Vous attaquez Victor avec <strong>{getCard(cf.attaqueId)?.label}</strong>.<br/>Victor riposte avec <strong>{getCard(cf.botteId)?.label}</strong> !</p><button style={th.btn("#1a5276")} onClick={()=>handleCF(true)}>Continuer</button></div>)}</div></div>)}

      {mancheResult&&!gameOver&&(<div style={mdlOverlay}><div style={th.modal}><div style={{fontSize:"26px",marginBottom:"6px"}}>{mancheResult.winner==="player"?"🏆":"🏎️"}</div><h2 style={{color:th.title,marginBottom:"4px",fontSize:"15px"}}>Fin de la course {manche}</h2><p style={{fontSize:"11px",color:th.subtext,marginBottom:"10px"}}>{mancheResult.winner==="player"?dn+" remporte la course !":"Victor remporte la course !"}</p><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"10px"}}><div style={{background:dark?"rgba(224,112,112,0.1)":"rgba(139,0,0,0.08)",borderRadius:"8px",padding:"7px"}}><div style={{fontSize:"10px",fontWeight:"bold",color:th.playerBar}}>👤 {dn}</div><div style={{fontSize:"15px",fontWeight:"bold",color:th.playerBar}}>+{mancheResult.playerScore}</div><div style={{fontSize:"9px",color:dark?"#778":"#888"}}>Total : {mancheResult.total.player}</div><div style={{height:"4px",background:th.barBg,borderRadius:"2px",marginTop:"3px",overflow:"hidden"}}><div style={{height:"100%",width:barW(mancheResult.total.player)+"%",background:th.playerBar,transition:"width 0.6s ease"}}/></div></div><div style={{background:dark?"rgba(91,141,217,0.1)":"rgba(68,85,102,0.08)",borderRadius:"8px",padding:"7px"}}><div style={{fontSize:"10px",fontWeight:"bold",color:th.aiBar}}>🏎️ Victor</div><div style={{fontSize:"15px",fontWeight:"bold",color:th.aiBar}}>+{mancheResult.aiScore}</div><div style={{fontSize:"9px",color:dark?"#778":"#888"}}>Total : {mancheResult.total.ai}</div><div style={{height:"4px",background:th.barBg,borderRadius:"2px",marginTop:"3px",overflow:"hidden"}}><div style={{height:"100%",width:barW(mancheResult.total.ai)+"%",background:th.aiBar,transition:"width 0.6s ease"}}/></div></div></div><div style={{fontSize:"10px",color:dark?"#d4ac0d":"#7d6608",marginBottom:"10px"}}>{SCORE_CIBLE-Math.max(mancheResult.total.player,mancheResult.total.ai)} pts restants</div><button style={{...th.btn("#27ae60"),fontSize:"12px"}} onClick={()=>{const fp=mancheResult.winner;setFirstPlayer(fp);setManche(m=>m+1);setMancheResult(null);setDisplayedPlayerKm(0);setDisplayedAiKm(0);setMancheCFCount(0);setAiMaxKm(0);const ns=initManche(fp,difficulty);setState(fp==="ai"?{...ns,phase:"ai_turn"}:ns);}}>▶️ Course {manche+1} !</button></div></div>)}

      {gameOver&&(<div style={mdlOverlay}><div style={th.modal}><div style={{fontSize:"36px",marginBottom:"6px"}}>{gameOver.winner==="player"?"🏆":"😢"}</div><h2 style={{color:th.title,marginBottom:"6px",fontSize:"16px"}}>{gameOver.winner==="player"?"Bravo "+dn+" !":"Victor s'impose !"}</h2><p style={{fontSize:"11px",color:th.subtext,marginBottom:"10px"}}>{gameOver.winner==="player"?"Vous avez vaincu Victor !":"Victor reste invaincu..."}</p>{hardcoreUnlocked&&!progress.unlocked.includes("win_hardcore")&&(<div style={{background:"linear-gradient(135deg,#1a1a2e,#8B0000)",border:"2px solid #FFD700",borderRadius:"10px",padding:"10px",marginBottom:"12px"}}><div style={{fontSize:"20px",marginBottom:"4px"}}>💀</div><div style={{color:"#FFD700",fontWeight:"bold",fontSize:"13px",marginBottom:"3px"}}>MODE HARDCORE DÉBLOQUÉ !</div><div style={{color:"rgba(255,255,255,0.8)",fontSize:"10px"}}>Vous avez prouvé votre valeur.</div></div>)}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"10px"}}><div style={{background:dark?"rgba(224,112,112,0.1)":"rgba(139,0,0,0.08)",borderRadius:"8px",padding:"8px"}}><div style={{fontSize:"10px",fontWeight:"bold",color:th.playerBar}}>👤 {dn}</div><div style={{fontSize:"18px",fontWeight:"bold",color:th.playerBar}}>{gameOver.total.player}</div></div><div style={{background:dark?"rgba(91,141,217,0.1)":"rgba(68,85,102,0.08)",borderRadius:"8px",padding:"8px"}}><div style={{fontSize:"10px",fontWeight:"bold",color:th.aiBar}}>🏎️ Victor</div><div style={{fontSize:"18px",fontWeight:"bold",color:th.aiBar}}>{gameOver.total.ai}</div></div></div><div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}><button style={th.btn()} onClick={nouvellePartie}>🔄 Rejouer</button><button style={th.btn("#445566")} onClick={onBack}>🏠 Accueil</button></div></div></div>)}

      {showTirage&&(<div style={mdlOverlay}><div style={th.modal}>
        <div style={{fontSize:"26px",marginBottom:"6px"}}>🎲</div>
        <h2 style={{color:th.title,marginBottom:"6px",fontSize:"16px",letterSpacing:"2px"}}>QUI COMMENCE ?</h2>
        <div style={{marginBottom:"10px"}}>
          <label style={{fontSize:"10px",fontWeight:"bold",color:th.subtext,display:"block",marginBottom:"6px"}}>DIFFICULTÉ</label>
          <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
            {[["easy","😊 Facile","#27ae60"],["normal","🎯 Normal","#e67e22"],["hard","🔥 Difficile","#c0392b"]].map(item=>(
              <button key={item[0]} onClick={()=>setDifficulty(item[0])} style={{background:difficulty===item[0]?item[2]:"#888",color:"#fff",border:"none",borderRadius:"8px",padding:"6px 10px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"10px",textTransform:"uppercase",opacity:difficulty===item[0]?1:0.6}}>{item[1]}</button>
            ))}
            {hardcoreUnlocked&&<button onClick={()=>setDifficulty("hardcore")} style={{background:difficulty==="hardcore"?"#1a1a2e":"#888",color:difficulty==="hardcore"?"#FFD700":"#fff",border:difficulty==="hardcore"?"2px solid #FFD700":"2px solid transparent",borderRadius:"8px",padding:"6px 10px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"10px",textTransform:"uppercase",opacity:difficulty==="hardcore"?1:0.6}}>💀 Hardcore</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:"16px",justifyContent:"center",marginBottom:"16px"}}>
          <div style={{textAlign:"center"}}><div style={{fontSize:"10px",fontWeight:"bold",marginBottom:"5px",color:th.playerBar}}>{dn.toUpperCase()}</div><De val={des[0]} dark={dark}/></div>
          <div style={{fontSize:"22px",alignSelf:"center",color:th.subtext}}>VS</div>
          <div style={{textAlign:"center"}}><div style={{fontSize:"10px",fontWeight:"bold",marginBottom:"5px",color:th.aiBar}}>VICTOR</div><De val={des[1]} dark={dark}/></div>
        </div>
        {tirageStep===0&&<button style={{background:"#8B0000",color:"#fff",border:"none",borderRadius:"8px",padding:"9px 18px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"12px",textTransform:"uppercase"}} onClick={lancerDes} disabled={tirageAnim}>{tirageAnim?"🎲 ...":"🎲 Lancer les dés !"}</button>}
        {tirageStep===1&&(<div><div style={{fontSize:"13px",fontWeight:"bold",marginBottom:"12px",color:firstPlayer==="player"?"#27ae60":th.title}}>{des[0]>des[1]&&"🏆 "+dn+" commence !"}{des[1]>des[0]&&"🏎️ Victor commence !"}{des[0]===des[1]&&"⚖️ Égalité — relancez !"}</div>{des[0]===des[1]?<button style={{background:"#e67e22",color:"#fff",border:"none",borderRadius:"8px",padding:"8px 14px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"11px",textTransform:"uppercase"}} onClick={()=>{setTirageStep(0);setTirageAnim(false);}}>🎲 Relancer</button>:<button style={{background:"#27ae60",color:"#fff",border:"none",borderRadius:"8px",padding:"8px 14px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"11px",textTransform:"uppercase"}} onClick={demarrerPartie}>▶️ Démarrer !</button>}</div>)}
      </div></div>)}

      <button style={{position:"fixed",bottom:"16px",right:"16px",zIndex:50,background:dark?"linear-gradient(135deg,#2a3a5a,#1a2a4a)":"linear-gradient(135deg,#5d4037,#3e2723)",color:"#fdf6e3",border:"2px solid "+(dark?"#4a6fa5":"#fdf6e3"),borderRadius:"50px",padding:"8px 14px",cursor:"pointer",fontWeight:"bold",letterSpacing:"1px",fontFamily:"Georgia,serif",fontSize:"10px",textTransform:"uppercase",boxShadow:"0 4px 12px rgba(0,0,0,0.4)"}} onClick={nouvellePartie}>🔄 Nouveau championnat</button>
    </div>
  );
}

// ── APP ────────────────────────────────────────────────────────────────────────
// ── PSEUDO MODAL ─────────────────────────────────────────────────────────────
// ── OBJECTIFS JOURNALIERS ─────────────────────────────────────────────────────
const DAILY_POOL=[
  // 1 vs 1 (solo)
  {id:"d_win_solo",label:"Vainqueur du jour",desc:"Gagner une course contre Victor",pts:50,diff:"easy",mode:"solo"},
  {id:"d_cf_solo",label:"Coup-Fourré !",desc:"Jouer un Coup-Fourré contre Victor",pts:50,diff:"easy",mode:"solo"},
  {id:"d_200km_solo",label:"Turbo !",desc:"Jouer une carte 200 km contre Victor",pts:50,diff:"easy",mode:"solo"},
  {id:"d_hard_solo",label:"Mode difficile",desc:"Gagner contre Victor en mode Difficile ou Hardcore",pts:100,diff:"medium",mode:"solo"},
  {id:"d_no_block_solo",label:"Route libre",desc:"Gagner une course sans jamais être bloqué",pts:100,diff:"medium",mode:"solo"},
  {id:"d_2cf_solo",label:"Double Fourré",desc:"Réussir 2 CF dans la même course",pts:200,diff:"hard",mode:"solo"},
  {id:"d_fast_solo",label:"Expéditif",desc:"Gagner en moins de 20 tours",pts:200,diff:"hard",mode:"solo"},
  {id:"d_no_discard_solo",label:"Sélectif",desc:"Gagner sans défausser plus de 3 cartes",pts:200,diff:"hard",mode:"solo"},

  // 1 vs 3 (4j)
  {id:"d_win_4j",label:"Vainqueur du peloton",desc:"Gagner une course à 4",pts:50,diff:"easy",mode:"4j"},
  {id:"d_cf_4j",label:"Coup-Fourré !",desc:"Jouer un Coup-Fourré en 1vs3",pts:50,diff:"easy",mode:"4j"},
  {id:"d_200km_4j",label:"Turbo !",desc:"Jouer une carte 200 km en 1vs3",pts:50,diff:"easy",mode:"4j"},
  {id:"d_2targets_4j",label:"Multi-cibles",desc:"Attaquer 2 adversaires différents dans une course",pts:100,diff:"medium",mode:"4j"},
  {id:"d_200lead_4j",label:"Écrasant",desc:"Terminer une course avec 200+ km d'avance sur le 2ème",pts:100,diff:"medium",mode:"4j"},
  {id:"d_2wins_4j",label:"Doublé",desc:"Gagner 2 courses à 4 dans la journée",pts:200,diff:"hard",mode:"4j"},
  {id:"d_no_block_4j",label:"Route libre",desc:"Gagner une course à 4 sans jamais être bloqué",pts:200,diff:"hard",mode:"4j"},
  {id:"d_fast_champ_4j",label:"Champion express",desc:"Terminer un championnat à 4 en moins de 4 courses",pts:200,diff:"hard",mode:"4j"},
];

function getDailyObjectifs(){
  const day=Math.floor(Date.now()/86400000);
  const seeded=(n)=>{let x=Math.sin(day*9301+n*49297+233)*100003;return x-Math.floor(x);};
  const soloPool=DAILY_POOL.filter(o=>o.mode==="solo");
  const fjPool=DAILY_POOL.filter(o=>o.mode==="4j");
  // 1 easy, 1 medium/hard par mode
  const pickByDiff=(pool,diffs,seed)=>{
    const arr=pool.filter(o=>diffs.includes(o.diff));
    return arr[Math.floor(seeded(seed)*arr.length)];
  };
  return{
    solo:[pickByDiff(soloPool,["easy"],1),pickByDiff(soloPool,["medium","hard"],2)].filter(Boolean),
    "4j":[pickByDiff(fjPool,["easy"],3),pickByDiff(fjPool,["medium","hard"],4)].filter(Boolean),
  };
}

function getDailyKey(){return`daily_${Math.floor(Date.now()/86400000)}`;}

function checkDailyObjectifs(params,currentProgress){
  const{winner,playerState,diff,cfCount,discardCount,raceIndex,attackTargets,kmLead,mancheCount}=params;
  const key=getDailyKey();
  const already=currentProgress.dailyDone?.[key]||[];
  const newDone=[];
  const check=(id,cond)=>{if(!already.includes(id)&&!newDone.includes(id)&&cond)newDone.push(id);};
  check("d_win",winner==="player"||winner===true);
  check("d_cf",cfCount>=1);
  check("d_500km",(currentProgress.totalKm||0)+(playerState?.km||0)>=500);
  check("d_200km",(playerState?.bornes||[]).includes("b200"));
  check("d_2parades",(playerState?.paradesCount||0)>=2);
  check("d_discard5",winner&&(discardCount||0)<5);
  check("d_hard",(winner==="player"||winner===true)&&(diff==="hard"||diff==="hardcore"));
  check("d_4bottes",(playerState?.bottes||[]).length>=4);
  check("d_attack3",(attackTargets||[]).some(t=>(attackTargets.filter(x=>x===t).length)>=3));
  check("d_first_win",(raceIndex===0||raceIndex===1)&&(winner==="player"||winner===true));
  check("d_2targets",[...new Set(attackTargets||[])].length>=2);
  check("d_200lead",(kmLead||0)>=200);
  check("d_2wins",(currentProgress.dailyWins||0)+(winner==="player"||winner===true?1:0)>=2);
  check("d_2cf_race",cfCount>=2);
  check("d_no_block",(winner==="player"||winner===true)&&!(playerState?.wasAttacked));
  check("d_fast_champ",(mancheCount||0)<=4&&(winner==="player"||winner===true));
  if(newDone.length===0)return null;
  const addedPts=newDone.reduce((s,id)=>{const o=DAILY_POOL.find(x=>x.id===id);return s+(o?o.pts:0);},0);
  const updated={...currentProgress.dailyDone,[key]:[...already,...newDone]};
  return{newDone,addedPts,dailyDone:updated};
}
const AVATARS=[
  {emoji:"🧑", label:"Pilote",       unlock:null},         // dès le début
  {emoji:"🏎️", label:"Première victoire", unlock:"first_win"},
  {emoji:"🚗", label:"Apprenti",     unlock:"play10"},
  {emoji:"🚕", label:"Routard",      unlock:"play50"},
  {emoji:"🚙", label:"Habitué",      unlock:"play100"},
  {emoji:"🚓", label:"Hardcore",     unlock:"win_hardcore"},
  {emoji:"🚑", label:"Triplé",       unlock:"win3_streak"},
  {emoji:"🚒", label:"Champion",     unlock:"win50"},
  {emoji:"🚐", label:"Marathonien",  unlock:"play500"},
  {emoji:"🛻", label:"Légende",      unlock:"win100"},
  {emoji:"🚌", label:"Perfectionniste", unlock:"all_objectives"},
  {emoji:"🤖", label:"Difficile",    unlock:"win_hard"},
  {emoji:"👾", label:"Triple Fourré",unlock:"cf3"},
  {emoji:"🦸", label:"Sans gaspillage", unlock:"win_no_discard"},
  {emoji:"🧙", label:"Arsenal",      unlock:"all_bottes"},
  {emoji:"👴", label:"50 000 km",    unlock:"total_50k"},
  {emoji:"👵", label:"Remontée héroïque", unlock:"win_from_zero"},
  {emoji:"👨", label:"Route libre",  unlock:"no_block"},
  {emoji:"👩", label:"Pacifiste",    unlock:"win_no_attack"},
  {emoji:"🧔", label:"Capot !",      unlock:"capot"},
];

function PseudoModal({dark, onSave, canClose, unlockedIds, currentAvatar}){
  const [draft,setDraft]=useState("");
  const [err,setErr]=useState("");
  const [avatar,setAvatar]=useState(currentAvatar||"🧑");
  const [tooltip,setTooltip]=useState(null);
  const th={bg:dark?"#1e2a3a":"#fdf6e3",border:dark?"#4a6fa5":"#8B0000",text:dark?"#e8e0d0":"#2c1810",sub:dark?"#a89880":"#5d4037"};

  const objDesc=(unlockId)=>{
    if(!unlockId)return"Disponible dès le début";
    const obj=OBJECTIFS.find(o=>o.id===unlockId);
    return obj?obj.desc:`Objectif : ${unlockId}`;
  };

  function save(){
    const p=draft.trim();
    if(p.length<2){setErr("Minimum 2 caractères.");return;}
    if(p.length>16){setErr("Maximum 16 caractères.");return;}
    onSave(p,avatar);
  }
  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}}>
      <div style={{background:th.bg,border:"3px solid "+th.border,borderRadius:"20px",padding:"24px 20px",width:"min(380px,94vw)",fontFamily:"Georgia,serif",textAlign:"center",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:"48px",marginBottom:"4px"}}>{avatar}</div>
        <h2 style={{color:th.border,fontSize:"18px",marginBottom:"4px",letterSpacing:"2px"}}>CHOISIS TON PSEUDO</h2>
        <p style={{fontSize:"11px",color:th.sub,marginBottom:"16px"}}>Il apparaîtra dans le classement global.<br/>Tu pourras le changer plus tard.</p>
        <input
          type="text" maxLength={16} value={draft} onChange={e=>{setDraft(e.target.value);setErr("");}}
          onKeyDown={e=>{if(e.key==="Enter")save();}}
          placeholder="Ton pseudo..."
          style={{width:"100%",padding:"12px 16px",borderRadius:"10px",border:"2px solid "+(dark?"#445566":"#a0856a"),fontFamily:"Georgia,serif",fontSize:"16px",textAlign:"center",background:dark?"#1e2a3a":"#fffef5",color:th.text,outline:"none",boxSizing:"border-box",marginBottom:"8px"}}
          autoFocus
        />
        {err&&<div style={{fontSize:"11px",color:"#c0392b",marginBottom:"8px"}}>{err}</div>}

        {/* Sélection avatar */}
        <div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"11px",fontWeight:"bold",color:th.sub,textTransform:"uppercase",letterSpacing:"1px",marginBottom:"8px"}}>Avatar</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"6px"}}>
            {AVATARS.map(a=>{
              const unlocked=!a.unlock||(unlockedIds||[]).includes(a.unlock);
              const selected=avatar===a.emoji;
              return(
                <div key={a.emoji}
                  onClick={()=>{if(unlocked)setAvatar(a.emoji);}}
                  onMouseEnter={()=>setTooltip({...a,unlocked})}
                  onMouseLeave={()=>setTooltip(null)}
                  onTouchStart={()=>setTooltip(p=>p?.emoji===a.emoji?null:{...a,unlocked})}
                  style={{
                    background:selected?(dark?"rgba(139,0,0,0.4)":"rgba(139,0,0,0.15)"):(dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.04)"),
                    border:selected?"2px solid #8B0000":"2px solid transparent",
                    borderRadius:"10px",padding:"6px 2px",cursor:unlocked?"pointer":"not-allowed",
                    display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",
                    opacity:unlocked?1:0.35,filter:unlocked?"none":"grayscale(1)",
                    transition:"all 0.15s"
                  }}>
                  <div style={{fontSize:"22px"}}>{a.emoji}</div>
                  <div style={{fontSize:"7px",color:th.sub,lineHeight:1.2,textAlign:"center"}}>{unlocked?a.label:"🔒"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
          {canClose&&<button onClick={()=>onSave(null,null)} style={{background:"#7f8c8d",color:"#fff",border:"none",borderRadius:"10px",padding:"10px 20px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold"}}>Annuler</button>}
          <button onClick={save} style={{background:"linear-gradient(135deg,#8B0000,#c0392b)",color:"#fff",border:"none",borderRadius:"10px",padding:"10px 24px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"12px",fontWeight:"bold",letterSpacing:"1px"}}>✅ Valider</button>
        </div>
      </div>

      {/* Tooltip fixed — hors flow, zéro CLS */}
      {tooltip&&(
        <div style={{position:"fixed",bottom:"24px",left:"50%",transform:"translateX(-50%)",zIndex:600,background:dark?"#1e2a3a":"#2c1810",color:"#fff",borderRadius:"12px",padding:"10px 16px",fontSize:"12px",lineHeight:1.5,border:"2px solid "+(tooltip.unlocked?"#27ae60":"#e67e22"),maxWidth:"260px",textAlign:"center",pointerEvents:"none",boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
          <div style={{fontSize:"24px",marginBottom:"3px"}}>{tooltip.emoji}</div>
          <div style={{fontWeight:"bold",fontSize:"13px",marginBottom:"4px"}}>{tooltip.label}</div>
          {tooltip.unlocked
            ?<div style={{color:"#27ae60",fontSize:"11px"}}>✅ Débloqué</div>
            :<><div style={{color:"#e67e22",fontSize:"10px",marginBottom:"2px"}}>🔒 Verrouillé</div>
              <div style={{color:"rgba(255,255,255,0.75)",fontSize:"10px"}}>{objDesc(tooltip.unlock)}</div></>
          }
        </div>
      )}
    </div>
  );
}

export default function App(){
  const { user, isLoaded } = useUser();
  const [screen,setScreen]=useState("home");
  const [dark,setDark]=useState(false);
  const [progress,setProgress]=useState({...INIT_PROGRESS});
  const [soundOn,setSoundOn]=useState(true);
  const [gameProgress,setGameProgress]=useState(null);
  const [pseudo,setPseudo]=useState("");
  const [showPseudoModal,setShowPseudoModal]=useState(false);
  const [dataLoaded,setDataLoaded]=useState(false);

  useEffect(()=>{
    if(!isLoaded||!user)return;
    storageGetPlayer(user.id).then(saved=>{
      if(saved&&saved.playerName){
        setPseudo(saved.playerName);
        setProgress({...INIT_PROGRESS,...saved});
      } else {
        setShowPseudoModal(true);
      }
      setDataLoaded(true);
    }).catch(()=>{setShowPseudoModal(true);setDataLoaded(true);});
  },[isLoaded,user]);

  function goToGame4J(){
    if(!pseudo){setShowPseudoModal(true);return;}
    setScreen("game4j");
  }

  function goToGame(){
    if(!pseudo){setShowPseudoModal(true);return;}
    storageGetPlayer(user.id).then(saved=>{
      const p=saved?{...INIT_PROGRESS,...saved,playerName:pseudo}:{...INIT_PROGRESS,playerName:pseudo};
      setProgress(p);setGameProgress(p);setScreen("game");
    }).catch(()=>{
      const p={...INIT_PROGRESS,playerName:pseudo};
      setProgress(p);setGameProgress(p);setScreen("game");
    });
  }

  function handleSetProgress(p){
    setGameProgress(p);setProgress(p);
    if(user)storageSavePlayer(user.id,pseudo,p);
  }

  function savePseudo(newPseudo,newAvatar){
    if(!newPseudo){setShowPseudoModal(false);return;}
    setPseudo(newPseudo);
    setShowPseudoModal(false);
    const updated={...progress,playerName:newPseudo,avatar:newAvatar||progress.avatar||"🧑"};
    setProgress(updated);
    if(user)storageSavePlayer(user.id,newPseudo,updated);
  }

  if(!isLoaded)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Georgia,serif",fontSize:"18px",background:"#fdf6e3"}}>⏳ Chargement...</div>;

  if(!user)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(135deg,#fdf6e3,#fae8c0)",fontFamily:"Georgia,serif"}}>
      <div style={{fontSize:"64px",marginBottom:"16px"}}>🏁</div>
      <h1 style={{fontSize:"32px",fontWeight:"bold",color:"#8B0000",letterSpacing:"4px",marginBottom:"8px"}}>PIT CARDS</h1>
      <p style={{color:"#5d4037",marginBottom:"24px"}}>Le jeu de cartes de course</p>
      <SignInButton mode="modal">
        <button style={{background:"linear-gradient(135deg,#8B0000,#c0392b)",color:"#fff",border:"none",borderRadius:"12px",padding:"14px 36px",cursor:"pointer",fontWeight:"bold",fontSize:"16px",fontFamily:"Georgia,serif",letterSpacing:"2px",textTransform:"uppercase",boxShadow:"0 4px 16px rgba(139,0,0,0.4)"}}>
          🚗 Se connecter
        </button>
      </SignInButton>
    </div>
  );

  if(screen==="game4j"){
    return <GamePage4J dark={dark} setDark={setDark} onBack={()=>setScreen("home")} playerName={pseudo||"Joueur"} difficulty="normal" soundOn={soundOn} setSoundOn={setSoundOn} hardcoreUnlocked={progress.unlocked.includes("win_hard")}
      version={VERSION}
      progress={progress}
      onProgress={(params)=>{
        setProgress(p=>{
          const{winner,playerKm,scores}=params;
          const newManchesPlayed=(p.manchesPlayed||0)+1;
          const newWins=winner?(p.wins||0)+1:(p.wins||0);
          const newTotalKm=(p.totalKm||0)+(playerKm||0);
          const myScore=scores?.[pseudo]||scores?.player||0;
          const newBest=Math.max(p.bestMancheScore||0,myScore);
          const prev=p.stats_4j||{};
          const newStrk=winner?(prev.winStreak||0)+1:0;
          const np={...p,
            manchesPlayed:newManchesPlayed,wins:newWins,totalKm:newTotalKm,bestMancheScore:newBest,
            stats_4j:{wins:(prev.wins||0)+(winner?1:0),played:(prev.played||0)+1,totalKm:(prev.totalKm||0)+(playerKm||0),bestScore:Math.max(prev.bestScore||0,myScore),winStreak:Math.max(prev.winStreak||0,newStrk)}
          };
          if(user)storageSavePlayer(user.id,pseudo,np);
          return np;
        });
      }}
      onDailyProgress={(params)=>{
        setProgress(p=>{
          const daily=checkDailyObjectifs(params,p);
          if(!daily)return p;
          const np={...p,dailyDone:daily.dailyDone,objPts:(p.objPts||0)+daily.addedPts,dailyWins:(p.dailyWins||0)+(params.winner?1:0)};
          if(user)storageSavePlayer(user.id,pseudo,np);
          return np;
        });
      }}
    />;
  }

  if(screen==="game"&&gameProgress){
    return(
      <>
        {showPseudoModal&&<PseudoModal dark={dark} onSave={savePseudo} canClose={true} unlockedIds={progress.unlocked} currentAvatar={progress.avatar}/>}
        <GamePage dark={dark} setDark={setDark} onBack={()=>setScreen("home")} progress={gameProgress} setProgress={handleSetProgress} soundOn={soundOn} setSoundOn={setSoundOn}/>
      </>
    );
  }

  // Sécurité : si pas connecté, affiche la page de login
  if(!user) return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"linear-gradient(135deg,#fdf6e3,#fae8c0)",fontFamily:"Georgia,serif"}}>
      <div style={{fontSize:"64px",marginBottom:"16px"}}>🏁</div>
      <h1 style={{fontSize:"32px",fontWeight:"bold",color:"#8B0000",letterSpacing:"4px",marginBottom:"8px"}}>PIT CARDS</h1>
      <p style={{color:"#5d4037",marginBottom:"24px"}}>Le jeu de cartes de course</p>
      <SignInButton mode="modal">
        <button style={{background:"linear-gradient(135deg,#8B0000,#c0392b)",color:"#fff",border:"none",borderRadius:"12px",padding:"14px 36px",cursor:"pointer",fontWeight:"bold",fontSize:"16px",fontFamily:"Georgia,serif",letterSpacing:"2px",textTransform:"uppercase",boxShadow:"0 4px 16px rgba(139,0,0,0.4)"}}>
          🚗 Se connecter
        </button>
      </SignInButton>
    </div>
  );

  return(
    <>
      {showPseudoModal&&<PseudoModal dark={dark} onSave={savePseudo} canClose={!!pseudo} unlockedIds={progress.unlocked} currentAvatar={progress.avatar}/>}
      <HomePage dark={dark} setDark={setDark} onPlay={goToGame} onPlay4J={goToGame4J} progress={progress} soundOn={soundOn} setSoundOn={setSoundOn} userButton={<UserButton/>} pseudo={pseudo} avatar={progress.avatar||"🧑"} onChangePseudo={()=>setShowPseudoModal(true)}/>
    </>
  );
}
