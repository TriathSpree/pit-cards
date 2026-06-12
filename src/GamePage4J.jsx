import { useState, useEffect, useRef } from "react";

// ── CONSTANTES (partagées) ────────────────────────────────────────────────────
const BORNES=[{id:"b25",type:"borne",km:25,label:"25 km"},{id:"b50",type:"borne",km:50,label:"50 km"},{id:"b75",type:"borne",km:75,label:"75 km"},{id:"b100",type:"borne",km:100,label:"100 km"},{id:"b200",type:"borne",km:200,label:"200 km"}];
const ATTAQUES=[{id:"accident",type:"attaque",label:"Collision"},{id:"panne",type:"attaque",label:"Manque de carburant"},{id:"crevaison",type:"attaque",label:"Pneus usés"},{id:"feu_rouge",type:"attaque",label:"🚩 Drapeau rouge"},{id:"limite",type:"attaque",label:"🟡 Drapeau jaune"}];
const PARADES=[{id:"reparations",type:"parade",label:"Arrêt au stand",attaque:"accident"},{id:"essence",type:"parade",label:"Ravitaillement",attaque:"panne"},{id:"roue_secours",type:"parade",label:"Pneus neufs",attaque:"crevaison"},{id:"feu_vert",type:"parade",label:"🟢 Drapeau vert",attaque:"feu_rouge"},{id:"fin_limite",type:"parade",label:"Vitesse libre",attaque:"limite"}];
const BOTTES=[{id:"as_volant",type:"botte",label:"Pole Position",counters:"accident"},{id:"citerne",type:"botte",label:"Réserve carburant",counters:"panne"},{id:"increvable",type:"botte",label:"Pneus Kevlar",counters:"crevaison"},{id:"prioritaire",type:"botte",label:"Safety Car",counters:["feu_rouge","limite"]}];
const ALL=[...BORNES,...ATTAQUES,...PARADES,...BOTTES];
const getCard=id=>ALL.find(c=>c.id===id);
const botteFor=id=>BOTTES.find(b=>Array.isArray(b.counters)?b.counters.includes(id):b.counters===id);
const SCORE_CIBLE=5000;
const AI_NAMES=["Victor","Salomé","Raquel"];
const AI_EMOJIS=["🏎️","🚗","🚕"];

function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function buildDeck(){
  const d=[];
  BORNES.forEach(c=>{const q={b25:10,b50:10,b75:10,b100:12,b200:4};for(let i=0;i<q[c.id];i++)d.push(c.id);});
  ATTAQUES.forEach(c=>{const q={accident:3,panne:3,crevaison:3,feu_rouge:5,limite:4};for(let i=0;i<q[c.id];i++)d.push(c.id);});
  PARADES.forEach(c=>{const q={reparations:6,essence:6,roue_secours:6,feu_vert:14,fin_limite:6};for(let i=0;i<q[c.id];i++)d.push(c.id);});
  BOTTES.forEach(c=>d.push(c.id));
  return shuffle(d);
}

function mkPlayer(name,isHuman,hand){
  return{name,isHuman,hand,km:0,attaque:null,limitee:false,started:false,bottes:[],coupsFourres:0,bornes:[],lastCard:null,lastLimite:null,wasAttacked:false,score:0};
}

function canBorne(p,id){
  const c=getCard(id);
  if(!p.started||p.attaque)return false;
  if(p.limitee&&c.km>50)return false;
  if(id==="b200"&&(p.bornes||[]).filter(b=>b==="b200").length>=2)return false;
  return p.km+c.km<=1000;
}
function canParade(p,id){
  const c=getCard(id);
  if(c.id==="feu_vert"){if(!p.started)return true;return p.attaque==="feu_rouge";}
  if(c.id==="fin_limite")return p.limitee;
  return p.attaque===c.attaque;
}
function canAttaque(t,id){
  const b=botteFor(id);
  if(b&&t.bottes.includes(b.id))return false;
  if(!t.started&&id!=="limite")return false;
  if(id==="limite")return!t.limitee;
  return!t.attaque;
}

function getPlaysFor(players,actorIdx){
  const actor=players[actorIdx];
  const plays=[];
  actor.hand.forEach(id=>{
    const c=getCard(id);
    if(c.type==="botte"){plays.push({cardId:id,action:"botte",targetIdx:actorIdx});return;}
    if(c.type==="borne"&&canBorne(actor,id)){plays.push({cardId:id,action:"borne",targetIdx:actorIdx});return;}
    if(c.type==="parade"&&canParade(actor,id)){plays.push({cardId:id,action:"parade",targetIdx:actorIdx});return;}
    if(c.type==="attaque"){
      players.forEach((t,ti)=>{
        if(ti!==actorIdx&&canAttaque(t,id))plays.push({cardId:id,action:"attaque",targetIdx:ti});
      });
    }
  });
  return plays;
}

function applyPlay(players,actorIdx,cardId,action,targetIdx){
  players=JSON.parse(JSON.stringify(players));
  const actor=players[actorIdx];
  const target=players[targetIdx];
  const idx=actor.hand.indexOf(cardId);
  if(idx!==-1)actor.hand.splice(idx,1);
  if(action==="borne"){
    actor.bornes=(actor.bornes||[]).concat(cardId);
    actor.km+=getCard(cardId).km;
  }else if(action==="parade"){
    const c=getCard(cardId);
    if(c.id==="fin_limite"){actor.limitee=false;actor.lastLimite=cardId;}
    else if(c.id==="feu_vert"){if(actor.attaque==="feu_rouge")actor.attaque=null;actor.started=true;actor.lastCard=cardId;}
    else{actor.attaque=null;actor.lastCard=cardId;}
  }else if(action==="attaque"){
    const c=getCard(cardId);
    if(c.id==="limite"){target.limitee=true;target.lastLimite=cardId;}
    else{target.attaque=cardId;target.lastCard=cardId;target.wasAttacked=true;}
  }else if(action==="botte"){
    const bo=getCard(cardId);
    actor.bottes.push(cardId);
    const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];
    if(actor.attaque&&co.includes(actor.attaque)){actor.attaque=null;}
    if(bo.id==="prioritaire"){actor.limitee=false;}
  }
  return players;
}

function aiChoose(players,actorIdx,diff){
  const plays=getPlaysFor(players,actorIdx);
  if(plays.length===0)return null;
  const actor=players[actorIdx];
  const hand=actor.hand;
  // Priorité: botte urgente > parade > attaque > borne
  const botteUrgent=plays.find(p=>{
    if(p.action!=="botte")return false;
    const bo=getCard(p.cardId);
    const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];
    return co.some(c=>actor.attaque===c||(c==="limite"&&actor.limitee));
  });
  const parade=plays.find(p=>p.action==="parade");
  const bornes=plays.filter(p=>p.action==="borne").sort((a,b)=>getCard(b.cardId).km-getCard(a.cardId).km);
  const attaques=plays.filter(p=>p.action==="attaque");
  // Attaque le joueur le plus avancé
  const bestAttaque=attaques.sort((a,b)=>players[b.targetIdx].km-players[a.targetIdx].km)[0];
  const botteAny=plays.find(p=>p.action==="botte");
  if(diff==="hardcore")return botteUrgent||bestAttaque||parade||botteAny||bornes[0]||null;
  return botteUrgent||parade||bestAttaque||bornes[0]||botteAny||null;
}

function aiDiscard(players,actorIdx){
  const hand=players[actorIdx].hand;
  const nonBotte=hand.filter(c=>getCard(c).type!=="botte");
  if(nonBotte.length===0)return null;
  // Défausse la plus petite borne ou une parade inutile
  const smallBorne=nonBotte.filter(c=>getCard(c).type==="borne").sort((a,b)=>getCard(a).km-getCard(b).km)[0];
  return smallBorne||nonBotte[0];
}

function cColor(id,dark){const c=getCard(id);if(!c)return dark?"#666":"#888";if(c.type==="borne")return dark?"#2e86c1":"#1a5276";if(c.type==="attaque")return dark?"#c0392b":"#922b21";if(c.type==="parade")return dark?"#27ae60":"#1e8449";if(c.type==="botte")return dark?"#d4ac0d":"#7d6608";return dark?"#777":"#555";}
function cEmoji(id){return{b25:"🚶",b50:"🚲",b75:"🛵",b100:"🏎️",b200:"✈️",accident:"💥",panne:"⛽",crevaison:"🔧",feu_rouge:"🚩",limite:"🟡",reparations:"🔩",essence:"⛽",roue_secours:"🔄",feu_vert:"🟢",fin_limite:"⚡",as_volant:"⭐",citerne:"🛢️",increvable:"🛡️",prioritaire:"🚔"}[id]||"🃏";}

const DOTS={1:[[50,50]],2:[[25,25],[75,75]],3:[[25,25],[50,50],[75,75]],4:[[25,25],[75,25],[25,75],[75,75]],5:[[25,25],[75,25],[50,50],[25,75],[75,75]],6:[[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]]};
function De({val,dark}){const dots=DOTS[val]||DOTS[1];return(<div style={{width:"50px",height:"50px",background:dark?"#2a2a3e":"#fff",borderRadius:"10px",border:"3px solid "+(dark?"#555":"#2c1810"),position:"relative",boxShadow:"2px 2px 6px rgba(0,0,0,0.4)"}}>{dots.map((p,i)=><div key={i} style={{position:"absolute",width:"9px",height:"9px",background:dark?"#e0e0e0":"#2c1810",borderRadius:"50%",left:"calc("+p[0]+"% - 4px)",top:"calc("+p[1]+"% - 4px)"}}/>)}</div>);}

// ── TIRAGE AU SORT 4 JOUEURS ──────────────────────────────────────────────────
function TirageModal({dark,playerName,difficulty,setDifficulty,hardcoreUnlocked,onStart}){
  const [phase,setPhase]=useState("roll"); // roll | result | done
  const [des,setDes]=useState([1,1,1,1]);
  const [anim,setAnim]=useState(false);
  const [order,setOrder]=useState(null); // ordre final des joueurs
  const [pending,setPending]=useState([0,1,2,3]); // indices qui doivent relancer

  const names=[playerName,...AI_NAMES];
  const emojis=["👤",...AI_EMOJIS];

  const th={
    bg:dark?"#1e2a3a":"#fdf6e3",border:dark?"4px double #4a6fa5":"4px double #8B0000",
    text:dark?"#e8e0d0":"#2c1810",sub:dark?"#a89880":"#5d4037",title:dark?"#e07070":"#8B0000"
  };

  function roll(){
    setAnim(true);
    let count=0;
    const iv=setInterval(()=>{
      setDes(prev=>{
        const next=[...prev];
        pending.forEach(i=>{next[i]=Math.ceil(Math.random()*6);});
        return next;
      });
      count++;
      if(count>12){
        clearInterval(iv);
        setAnim(false);
        setPhase("result");
      }
    },80);
  }

  function resolveResult(){
    // Vérifie les égalités parmi les pending
    const currentDes=[...des];
    const maxVal=Math.max(...pending.map(i=>currentDes[i]));
    const winners=pending.filter(i=>currentDes[i]===maxVal);
    if(winners.length===1){
      // Pas d'égalité — ce joueur commence
      // Ordre: winner, puis les autres dans l'ordre original
      const rest=pending.filter(i=>i!==winners[0]);
      // On reconstruit l'ordre complet
      const allIndices=[0,1,2,3];
      const notPending=allIndices.filter(i=>!pending.includes(i));
      // L'ordre final: winner d'abord, puis les autres pending, puis ceux déjà éliminés
      const finalOrder=[winners[0],...rest,...notPending];
      setOrder(finalOrder);
      setPhase("done");
    }else{
      // Égalité — seulement les gagnants ex-aequo relancent
      setPending(winners);
      setPhase("roll");
    }
  }

  function startGame(){
    // order[0] commence
    const playerOrder=order.map(i=>({
      name:names[i],
      isHuman:i===0,
      emoji:emojis[i]
    }));
    onStart(playerOrder,difficulty);
  }

  return(
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:th.bg,border:th.border,borderRadius:"16px",padding:"24px",maxWidth:"420px",width:"90%",fontFamily:"Georgia,serif",textAlign:"center"}}>
        <div style={{fontSize:"32px",marginBottom:"8px"}}>🎲</div>
        <h2 style={{color:th.title,fontSize:"16px",marginBottom:"4px",letterSpacing:"2px"}}>QUI COMMENCE ?</h2>

        {pending.length<4&&<p style={{fontSize:"11px",color:"#e67e22",marginBottom:"12px"}}>⚖️ Égalité ! {pending.map(i=>names[i]).join(" et ")} relancent...</p>}

        {/* Difficulté */}
        <div style={{marginBottom:"16px"}}>
          <div style={{fontSize:"10px",fontWeight:"bold",color:th.sub,marginBottom:"6px",textTransform:"uppercase"}}>Difficulté des IA</div>
          <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
            {[["easy","😊 Facile","#27ae60"],["normal","🎯 Normal","#e67e22"],["hard","🔥 Difficile","#c0392b"]].map(([v,l,c])=>(
              <button key={v} onClick={()=>setDifficulty(v)} style={{background:difficulty===v?c:"#888",color:"#fff",border:"none",borderRadius:"8px",padding:"5px 10px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"10px",fontWeight:"bold",opacity:difficulty===v?1:0.6}}>{l}</button>
            ))}
            {hardcoreUnlocked&&<button onClick={()=>setDifficulty("hardcore")} style={{background:difficulty==="hardcore"?"#1a1a2e":"#888",color:difficulty==="hardcore"?"#FFD700":"#fff",border:difficulty==="hardcore"?"2px solid #FFD700":"none",borderRadius:"8px",padding:"5px 10px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"10px",fontWeight:"bold",opacity:difficulty==="hardcore"?1:0.6}}>💀 Hardcore</button>}
          </div>
        </div>

        {/* Dés */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px"}}>
          {names.map((name,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"6px",opacity:pending.includes(i)?1:0.4}}>
              <div style={{fontSize:"11px",fontWeight:"bold",color:i===0?th.title:th.sub}}>{emojis[i]} {name}</div>
              <De val={des[i]} dark={dark}/>
              <div style={{fontSize:"12px",fontWeight:"bold",color:th.text}}>{des[i]}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {phase==="roll"&&(
          <button onClick={roll} disabled={anim} style={{background:"#8B0000",color:"#fff",border:"none",borderRadius:"10px",padding:"10px 24px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"13px",fontWeight:"bold"}}>
            {anim?"🎲 ...":"🎲 Lancer !"}
          </button>
        )}
        {phase==="result"&&(
          <button onClick={resolveResult} style={{background:"#e67e22",color:"#fff",border:"none",borderRadius:"10px",padding:"10px 24px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"13px",fontWeight:"bold"}}>
            Voir le résultat
          </button>
        )}
        {phase==="done"&&order&&(
          <div>
            <div style={{fontSize:"13px",fontWeight:"bold",marginBottom:"12px",color:"#27ae60"}}>
              🏆 {names[order[0]]} commence !
            </div>
            <div style={{fontSize:"11px",color:th.sub,marginBottom:"12px"}}>
              Ordre : {order.map(i=>names[i]).join(" → ")}
            </div>
            <button onClick={startGame} style={{background:"#27ae60",color:"#fff",border:"none",borderRadius:"10px",padding:"10px 24px",cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"13px",fontWeight:"bold"}}>
              ▶️ Démarrer !
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── GAME PAGE 4 JOUEURS ───────────────────────────────────────────────────────
export default function GamePage4J({dark,setDark,onBack,playerName,difficulty:initDiff,soundOn,setSoundOn,hardcoreUnlocked}){
  const [difficulty,setDifficulty]=useState(initDiff||"normal");
  const [showTirage,setShowTirage]=useState(true);
  const [players,setPlayers]=useState(null); // array de joueurs dans l'ordre du tour
  const [deck,setDeck]=useState([]);
  const [discard,setDiscard]=useState([]);
  const [turnIdx,setTurnIdx]=useState(0); // index dans players[] du joueur actuel
  const [phase,setPhase]=useState("play"); // play | ai_turn | end
  const [drawn,setDrawn]=useState(false);
  const [selected,setSelected]=useState(null);
  const [discardMode,setDiscardMode]=useState(false);
  const [targetIdx,setTargetIdx]=useState(null); // pour choisir la cible d'une attaque
  const [log,setLog]=useState([{text:"Partie à 4 — Bonne chance !",who:"system"}]);
  const [totalScores,setTotalScores]=useState({});
  const [manche,setManche]=useState(1);
  const [mancheOver,setMancheOver]=useState(null);
  const [gameOver,setGameOver]=useState(null);
  const [animCard,setAnimCard]=useState(null);
  const [coupFourreData,setCoupFourreData]=useState(null); // {attackerIdx, defenderIdx, attaqueId, botteId}

  const th={
    bg:dark?"linear-gradient(135deg,#1a1a2e,#16213e)":"linear-gradient(135deg,#fdf6e3,#fae8c0)",
    text:dark?"#e8e0d0":"#2c1810",sub:dark?"#a89880":"#5d4037",border:dark?"#445566":"#a0856a",
    cardBg:dark?"rgba(30,40,60,0.9)":"rgba(255,255,255,0.6)",
    title:dark?"#e07070":"#8B0000",accent:dark?"#4a9eda":"#1a5276",gold:"#d4ac0d",
    barBg:dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.1)",
    btn:(c)=>({background:c||"#8B0000",color:"#fff",border:"none",borderRadius:"8px",padding:"8px 14px",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"11px",textTransform:"uppercase",letterSpacing:"1px"}),
    modal:{background:dark?"#1e2a3a":"#fdf6e3",border:dark?"4px double #4a6fa5":"4px double #8B0000",borderRadius:"16px",padding:"20px",textAlign:"center",maxWidth:"360px",width:"90%"},
  };

  const humanIdx=players?players.findIndex(p=>p.isHuman):0;
  const isHumanTurn=players&&players[turnIdx]?.isHuman;
  const mustDraw=isHumanTurn&&phase==="play"&&!drawn;

  function addLog(text,who){setLog(prev=>[{text,who},...prev].slice(0,50));}

  function initGame(playerOrder,diff){
    setDifficulty(diff);
    const d=buildDeck();
    const ps=playerOrder.map((p,i)=>mkPlayer(p.name,p.isHuman,d.splice(0,6)));
    ps.forEach(p=>{p.emoji=playerOrder[playerOrder.indexOf(playerOrder.find(x=>x.name===p.name))].emoji||"🏎️";});
    setPlayers(ps);
    setDeck(d);
    setDiscard([]);
    setTurnIdx(0);
    setDrawn(false);
    setSelected(null);
    setLog([{text:`${playerOrder[0].name} commence !`,who:"system"}]);
    setShowTirage(false);
    const scores={};
    playerOrder.forEach(p=>{scores[p.name]=0;});
    if(Object.keys(totalScores).length===0)setTotalScores(scores);
    // Démarre en ai_turn si le premier joueur est une IA
    setTimeout(()=>{
      setPhase(playerOrder[0].isHuman ? "play" : "ai_turn");
    }, 100);
  }

  function drawForPlayer(idx,currentDeck,currentDiscard){
    let d=[...currentDeck],disc=[...currentDiscard];
    if(d.length===0){
      if(disc.length===0)return{card:null,deck:d,discard:disc};
      d=shuffle(disc);disc=[];
      addLog("🔄 Pioche reconstituée.","system");
    }
    const card=d.shift();
    return{card,deck:d,discard:disc};
  }

  function checkMancheEnd(ps){
    const winner=ps.find(p=>p.km===1000);
    if(winner){
      endManche(ps,winner.name);
      return true;
    }
    return false;
  }

  function calcPlayerScore(p,isWinner,others){
    let s=p.km;
    if(isWinner&&p.km===1000)s+=400;
    s+=p.bottes.length*100;
    s+=(p.coupsFourres||0)*300;
    if(isWinner&&!(p.bornes||[]).includes("b200"))s+=300;
    if(isWinner&&others.every(o=>o.km===0))s+=500; // capot total
    return s;
  }

  function endManche(ps,winnerName){
    const scores={};
    ps.forEach(p=>{
      const isW=p.name===winnerName;
      const others=ps.filter(o=>o.name!==p.name);
      scores[p.name]=calcPlayerScore(p,isW,others);
    });
    const newTotal={...totalScores};
    ps.forEach(p=>{newTotal[p.name]=(newTotal[p.name]||0)+scores[p.name];});
    setTotalScores(newTotal);
    setMancheOver({winner:winnerName,scores,total:newTotal});
    // Vérifie si quelqu'un a atteint SCORE_CIBLE
    const gameWinner=Object.entries(newTotal).sort((a,b)=>b[1]-a[1])[0];
    if(gameWinner[1]>=SCORE_CIBLE){
      setGameOver({winner:gameWinner[0],total:newTotal});
    }
  }

  function nextTurn(ps,currentTurnIdx,currentDeck,currentDiscard){
    let next;
    if(cfBonusTurn.current&&nextAfterCFRef.current!==null){
      // Après un tour bonus CF, on reprend depuis le joueur prévu
      next=nextAfterCFRef.current;
      cfBonusTurn.current=false;
      nextAfterCFRef.current=null;
    }else{
      next=(currentTurnIdx+1)%ps.length;
    }
    setTurnIdx(next);
    setDrawn(false);
    setSelected(null);
    setDiscardMode(false);
    setTargetIdx(null);
    if(ps[next].isHuman){
      setPhase("play");
    }else{
      setPhase("ai_turn");
    }
  }

  function handleCoupFourre(accept){
    if(!coupFourreData)return;
    const{attackerIdx,defenderIdx,attaqueId,botteId,deckAtTime,discardAtTime,psAtTime}=coupFourreData;
    let ps=JSON.parse(JSON.stringify(psAtTime));
    let d=[...deckAtTime];
    let disc=[...discardAtTime];

    if(accept){
      // Joue la botte
      const def=ps[defenderIdx];
      const hand=[...def.hand];
      hand.splice(hand.indexOf(botteId),1);
      def.hand=hand;
      def.bottes=[...def.bottes,botteId];
      const bo=getCard(botteId);
      const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];
      if(def.attaque&&co.includes(def.attaque))def.attaque=null;
      if(botteId==="prioritaire"){def.limitee=false;}
      def.coupsFourres=(def.coupsFourres||0)+1;
      // Carte bonus
      if(d.length>0){def.hand=[...def.hand,d.shift()];}
      addLog(`⚡ COUP-FOURRÉ ! ${def.name} neutralise avec ${bo.label} !`,def.name);
      ps[defenderIdx]=def;
      setPlayers(ps);setDeck(d);setDiscard(disc);
      setCoupFourreData(null);
      // Le défenseur joue un tour bonus, PUIS l'ordre reprend depuis attackerIdx+1
      // On mémorise que le prochain après le CF doit être attackerIdx+1
      const nextAfterCF=(attackerIdx+1)%ps.length;
      if(ps[defenderIdx].isHuman){
        setTurnIdx(defenderIdx);
        setPhase("play");
        setDrawn(true); // carte bonus déjà piochée
        // Après ce tour, nextTurn reprendra depuis defenderIdx mais on veut attackerIdx+1
        // On stocke le "vrai next" dans un ref
        nextAfterCFRef.current=nextAfterCF;
        cfBonusTurn.current=true;
      }else{
        setTurnIdx(defenderIdx);
        nextAfterCFRef.current=nextAfterCF;
        cfBonusTurn.current=true;
        setPhase("ai_turn");
      }
    }else{
      // Ignore le CF
      setCoupFourreData(null);
      setPlayers(ps);setDeck(d);setDiscard(disc);
      nextTurn(ps,attackerIdx,d,disc);
    }
  }

  // Vérifie si un coup-fourré est possible après une attaque
  function checkCoupFourre(ps,attackerIdx,attaqueId,targetIdx,d,disc){
    const bo=botteFor(attaqueId);
    if(!bo)return false;
    const defender=ps[targetIdx];
    if(defender.bottes.includes(bo.id))return false; // déjà jouée
    if(!defender.hand.includes(bo.id))return false; // pas en main
    // CF possible
    if(defender.isHuman){
      setCoupFourreData({attackerIdx,defenderIdx:targetIdx,attaqueId,botteId:bo.id,deckAtTime:d,discardAtTime:disc,psAtTime:ps});
      setPhase("coup_fourre");
    }else{
      // IA joue le CF automatiquement après délai
      setTimeout(()=>{
        let ps2=JSON.parse(JSON.stringify(playersRef.current));
        const def=ps2[targetIdx];
        const hand=[...def.hand];
        hand.splice(hand.indexOf(bo.id),1);
        def.hand=hand;
        def.bottes=[...def.bottes,bo.id];
        const co=Array.isArray(bo.counters)?bo.counters:[bo.counters];
        if(def.attaque&&co.includes(def.attaque))def.attaque=null;
        if(bo.id==="prioritaire")def.limitee=false;
        def.coupsFourres=(def.coupsFourres||0)+1;
        const d2=[...deckRef.current];
        const disc2=[...discardRef.current];
        if(d2.length>0){def.hand=[...def.hand,d2.shift()];}
        addLog(`⚡ COUP-FOURRÉ ! ${def.name} neutralise avec ${bo.label} !`,def.name);
        ps2[targetIdx]=def;
        setPlayers(ps2);setDeck(d2);setDiscard(disc2);
        // Le défenseur IA rejoue
        setTurnIdx(targetIdx);setPhase("ai_turn");
      },800);
    }
    return true;
  }

  // Refs pour valeurs fraîches dans useEffect
  const nextAfterCFRef=useRef(null);
  const cfBonusTurn=useRef(false);
  const playersRef=useRef(players);
  const deckRef=useRef(deck);
  const discardRef=useRef(discard);
  const turnIdxRef=useRef(turnIdx);
  useEffect(()=>{playersRef.current=players;},[players]);
  useEffect(()=>{deckRef.current=deck;},[deck]);
  useEffect(()=>{discardRef.current=discard;},[discard]);
  useEffect(()=>{turnIdxRef.current=turnIdx;},[turnIdx]);

  useEffect(()=>{
    if(!players||phase!=="ai_turn")return;
    const delay=difficulty==="hardcore"?600:1500;
    const t=setTimeout(()=>{
      let ps=JSON.parse(JSON.stringify(playersRef.current));
      let d=[...deckRef.current];
      let disc=[...discardRef.current];
      const idx=turnIdxRef.current;

      // Pioche
      const{card,deck:nd,discard:ndisc}=drawForPlayer(idx,d,disc);
      if(card){ps[idx]={...ps[idx],hand:[...ps[idx].hand,card]};}
      d=nd;disc=ndisc;

      // Choisit une action
      const play=aiChoose(ps,idx,difficulty);
      if(play){
        addLog(`${ps[idx].name} joue ${getCard(play.cardId)?.label}${play.targetIdx!==idx?" sur "+ps[play.targetIdx].name:""}`,ps[idx].name);
        ps=applyPlay(ps,idx,play.cardId,play.action,play.targetIdx);
        setAnimCard({id:play.cardId,from:"ai"});
        setTimeout(()=>setAnimCard(null),600);
        // CF possible après attaque IA
        if(play.action==="attaque"){
          const bo=botteFor(play.cardId);
          if(bo&&ps[play.targetIdx]&&ps[play.targetIdx].hand.includes(bo.id)&&!ps[play.targetIdx].bottes.includes(bo.id)){
            setPlayers(ps);setDeck(d);setDiscard(disc);
            checkCoupFourre(ps,idx,play.cardId,play.targetIdx,d,disc);
            return;
          }
        }
      }else{
        const td=aiDiscard(ps,idx);
        if(td){
          const hand=[...ps[idx].hand];
          hand.splice(hand.indexOf(td),1);
          disc=[...disc,td];
          ps[idx]={...ps[idx],hand};
          addLog(`${ps[idx].name} défausse ${getCard(td)?.label}`,ps[idx].name);
        }
      }

      setPlayers(ps);
      setDeck(d);
      setDiscard(disc);

      if(!checkMancheEnd(ps)){
        nextTurn(ps,idx,d,disc);
      }
    },delay);
    return()=>clearTimeout(t);
  },[phase,turnIdx]);

  function handleDraw(){
    if(!mustDraw)return;
    const{card,deck:nd,discard:ndisc}=drawForPlayer(turnIdx,deck,discard);
    if(!card){setDrawn(true);return;}
    const ps=players.map((p,i)=>i===turnIdx?{...p,hand:[...p.hand,card]}:p);
    setPlayers(ps);setDeck(nd);setDiscard(ndisc);setDrawn(true);
  }

  function getValidPlays(){
    if(!players||!drawn)return[];
    return getPlaysFor(players,turnIdx);
  }

  function handleCardClick(id){
    if(!drawn||phase!=="play")return;
    setSelected(prev=>prev===id?null:id);
    setTargetIdx(null);
  }

  function handlePlay(){
    if(!selected||!drawn)return;
    const validPlays=getValidPlays().filter(p=>p.cardId===selected);
    if(validPlays.length===0)return;

    // Si attaque avec plusieurs cibles possibles
    const attaques=validPlays.filter(p=>p.action==="attaque");
    if(attaques.length>1&&targetIdx===null){
      // Demande de choisir la cible
      setTargetIdx(-1); // mode sélection cible
      return;
    }

    const play=attaques.length>1&&targetIdx!==null
      ? attaques.find(p=>p.targetIdx===targetIdx)||attaques[0]
      : validPlays[0];

    if(!play)return;

    let ps=applyPlay(players,turnIdx,play.cardId,play.action,play.targetIdx);
    addLog(`${players[turnIdx].name} joue ${getCard(play.cardId)?.label}${play.action==="attaque"?" sur "+players[play.targetIdx].name:""}`,players[turnIdx].name);
    setAnimCard({id:play.cardId,from:"player"});
    setTimeout(()=>setAnimCard(null),600);
    setSelected(null);setTargetIdx(null);

    if(!checkMancheEnd(ps)){
      // Vérifie coup-fourré si c'est une attaque
      if(play.action==="attaque"){
        const cfPossible=checkCoupFourre(ps,turnIdx,play.cardId,play.targetIdx,deck,discard);
        if(cfPossible){setPlayers(ps);return;}
      }
      setPlayers(ps);
      nextTurn(ps,turnIdx,deck,discard);
    }else{
      setPlayers(ps);
    }
  }

  function handleDiscard(id){
    if(!drawn||!id)return;
    const ps=players.map((p,i)=>{
      if(i!==turnIdx)return p;
      const hand=p.hand.filter(c=>c!==id);
      return{...p,hand};
    });
    setDiscard([...discard,id]);
    setPlayers(ps);
    addLog(`${players[turnIdx].name} défausse ${getCard(id)?.label}`,players[turnIdx].name);
    setSelected(null);setDiscardMode(false);
    if(!checkMancheEnd(ps)){
      nextTurn(ps,turnIdx,deck,discard);
    }
  }

  function nextManche(){
    const d=buildDeck();
    const winnerName=mancheOver?.winner;
    const winnerIdx=players.findIndex(p=>p.name===winnerName);
    // Le gagnant commence la prochaine manche
    const newOrder=[...players.slice(winnerIdx),...players.slice(0,winnerIdx)];
    const ps=newOrder.map(p=>mkPlayer(p.name,p.isHuman,d.splice(0,6)));
    newOrder.forEach((p,i)=>{ps[i].emoji=p.emoji;});
    setPlayers(ps);setDeck(d);setDiscard([]);
    setTurnIdx(0);setPhase("play");setDrawn(false);
    setSelected(null);setMancheOver(null);setManche(m=>m+1);
    setLog([{text:`Manche ${manche+1} — ${winnerName} commence !`,who:"system"}]);
    if(!ps[0].isHuman)setPhase("ai_turn");
  }

  function renderPlayerCard(p,idx,isCurrent){
    const colors=["#8B0000","#1a5276","#1e8449","#7d6608"];
    const color=colors[idx%4];
    return(
      <div key={p.name} style={{background:isCurrent?(dark?"rgba(255,255,100,0.1)":"rgba(255,255,0,0.15)"):th.cardBg,border:`2px solid ${isCurrent?color:th.border}`,borderRadius:"10px",padding:"8px",minWidth:"130px",flex:1}}>
        <div style={{fontSize:"10px",fontWeight:"bold",color:isCurrent?color:th.sub,marginBottom:"4px",display:"flex",alignItems:"center",gap:"4px"}}>
          {p.emoji||"🏎️"} {p.name} {isCurrent&&"◀"}
        </div>
        <div style={{fontSize:"18px",fontWeight:"bold",color:th.accent}}>{p.km} km</div>
        <div style={{height:"4px",background:th.barBg,borderRadius:"2px",margin:"4px 0",overflow:"hidden"}}>
          <div style={{height:"100%",width:(p.km/1000*100)+"%",background:color,transition:"width 0.3s"}}/>
        </div>
        {p.attaque&&<div style={{fontSize:"9px",color:"#c0392b",fontWeight:"bold"}}>⚠️ {getCard(p.attaque)?.label}</div>}
        {p.limitee&&!p.attaque&&<div style={{fontSize:"9px",color:"#e67e22",fontWeight:"bold"}}>🐢 Limité</div>}
        {!p.started&&<div style={{fontSize:"9px",color:"#888"}}>🔴 Pas démarré</div>}
        {p.started&&!p.attaque&&!p.limitee&&<div style={{fontSize:"9px",color:"#27ae60"}}>🟢 En route</div>}
        {p.bottes.length>0&&<div style={{display:"flex",gap:"2px",flexWrap:"wrap",marginTop:"3px"}}>{p.bottes.map(b=><span key={b} style={{fontSize:"10px"}}>{cEmoji(b)}</span>)}</div>}
        <div style={{fontSize:"9px",color:th.gold,marginTop:"2px"}}>
          🏆 {(totalScores[p.name]||0)} pts
        </div>
      </div>
    );
  }

  const validPlays=drawn?getValidPlays():[];
  const validCardIds=[...new Set(validPlays.map(p=>p.cardId))];
  const mdlOverlay={position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100};

  return(
    <div style={{fontFamily:"Georgia,serif",background:th.bg,minHeight:"100vh",padding:"8px",color:th.text,boxSizing:"border-box"}}>

      {showTirage&&<TirageModal dark={dark} playerName={playerName} difficulty={difficulty} setDifficulty={setDifficulty} hardcoreUnlocked={hardcoreUnlocked} onStart={initGame}/>}

      {/* HEADER */}
      <div style={{display:"flex",gap:"6px",marginBottom:"8px",alignItems:"center"}}>
        <button onClick={onBack} style={{...th.btn("#445566"),padding:"4px 10px",fontSize:"12px"}}>← Accueil</button>
        <div style={{flex:1,textAlign:"center",padding:"5px",background:dark?"rgba(224,112,112,0.15)":"rgba(139,0,0,0.1)",borderRadius:"8px",fontWeight:"bold",fontSize:"12px"}}>
          {!players?"🎲 Tirage au sort...":
           phase==="ai_turn"?`⏳ ${players[turnIdx]?.name} réfléchit...`:
           mustDraw?"👆 Piochez une carte":
           `🃏 Votre tour — M.${manche}`}
        </div>
        <div style={{fontSize:"11px",fontWeight:"bold",color:th.sub,background:dark?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.7)",border:"2px solid "+th.border,borderRadius:"8px",padding:"4px 8px"}}>
          M.{manche} — {SCORE_CIBLE-Math.max(0,...Object.values(totalScores))} restants
        </div>
        <button onClick={()=>setSoundOn(v=>!v)} style={{...th.btn("#445566"),padding:"4px 8px",fontSize:"14px"}}>{soundOn?"🔊":"🔇"}</button>
        <button onClick={()=>setDark(v=>!v)} style={{...th.btn("#445566"),padding:"4px 8px",fontSize:"14px"}}>{dark?"☀️":"🌙"}</button>
      </div>

      {players&&(
        <>
          {/* JOUEURS */}
          <div style={{display:"flex",gap:"8px",marginBottom:"8px",flexWrap:"wrap"}}>
            {players.map((p,i)=>renderPlayerCard(p,i,i===turnIdx))}
          </div>

          {/* MAIN + LOG */}
          <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
            {/* MAIN */}
            <div style={{flex:1,background:dark?"rgba(10,20,40,0.6)":"rgba(26,82,118,0.05)",border:"2px dashed "+th.border,borderRadius:"10px",padding:"8px"}}>
              <div style={{fontSize:"11px",fontWeight:"bold",marginBottom:"6px",color:th.sub}}>
                {discardMode?"🗑️ DÉFAUSSER":"MAIN"} ({players[humanIdx]?.hand?.length||0})
                {targetIdx===-1&&<span style={{color:"#e67e22",marginLeft:"8px"}}>— Choisissez une cible</span>}
              </div>
              <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                {players[humanIdx]?.hand?.map(id=>{
                  const valid=!discardMode&&drawn&&validCardIds.includes(id);
                  const c=getCard(id);
                  return(
                    <div key={id} onClick={()=>handleCardClick(id)} style={{
                      background:valid?cColor(id,dark):dark?"#3a3a4a":"#9e9e9e",
                      color:"#fff",border:selected===id?"3px solid #FFD700":"2px solid rgba(255,255,255,0.2)",
                      borderRadius:"8px",padding:"4px 2px",cursor:valid?"pointer":"not-allowed",
                      width:"72px",minWidth:"72px",maxWidth:"72px",height:"80px",
                      display:"flex",flexDirection:"column",alignItems:"center",
                      justifyContent:"center",textAlign:"center",opacity:valid?1:0.45,
                      transform:selected===id?"translateY(-4px)":"none",transition:"transform 0.15s",
                      boxShadow:selected===id?"0 4px 12px rgba(255,215,0,0.4)":"none",
                      wordBreak:"break-word",lineHeight:1.2
                    }}>
                      <div style={{fontSize:"15px",marginBottom:"1px"}}>{cEmoji(id)}</div>
                      <div style={{fontSize:"9px",lineHeight:1.2}}>{c?.label}</div>
                      {c?.km&&<div style={{fontSize:"12px",fontWeight:"bold"}}>{c.km}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Sélection de cible pour attaque */}
              {targetIdx===-1&&selected&&(
                <div style={{marginTop:"8px"}}>
                  <div style={{fontSize:"11px",color:"#e67e22",marginBottom:"6px"}}>Choisir la cible :</div>
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {validPlays.filter(p=>p.cardId===selected&&p.action==="attaque").map(p=>(
                      <button key={p.targetIdx} onClick={()=>{setTargetIdx(p.targetIdx);}} style={{...th.btn("#c0392b"),fontSize:"11px",padding:"5px 10px"}}>
                        {players[p.targetIdx]?.emoji} {players[p.targetIdx]?.name}
                      </button>
                    ))}
                    <button onClick={()=>{setSelected(null);setTargetIdx(null);}} style={{...th.btn("#7f8c8d"),fontSize:"11px",padding:"5px 10px"}}>Annuler</button>
                  </div>
                </div>
              )}

              {/* Pioche + actions */}
              <div style={{display:"flex",gap:"8px",marginTop:"8px",alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:"6px",flexShrink:0}}>
                  <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"8px",padding:"5px 8px",textAlign:"center",minWidth:"60px"}}>
                    <div style={{fontSize:"20px"}}>🂠</div>
                    <div style={{fontSize:"13px",fontWeight:"bold",color:th.text}}>{deck.length}</div>
                    <div style={{fontSize:"8px",color:th.sub}}>pioche</div>
                    {mustDraw&&<button onClick={handleDraw} style={{...th.btn("#1a5276"),marginTop:"4px",padding:"3px 5px",fontSize:"9px"}}>Piocher</button>}
                  </div>
                  <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"8px",padding:"5px 8px",textAlign:"center",minWidth:"60px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                    {discard.length>0
                      ?<><div style={{fontSize:"18px"}}>{cEmoji(discard[discard.length-1])}</div>
                        <div style={{fontSize:"7px",fontWeight:"bold",color:cColor(discard[discard.length-1],dark),lineHeight:1.2}}>{getCard(discard[discard.length-1])?.label}</div></>
                      :<div style={{fontSize:"20px",opacity:0.3}}>🂠</div>}
                    <div style={{fontSize:"13px",fontWeight:"bold",color:th.text}}>{discard.length}</div>
                    <div style={{fontSize:"8px",color:th.sub}}>défausse</div>
                  </div>
                </div>

                {drawn&&!discardMode&&selected&&(targetIdx===null||targetIdx>=0)&&validCardIds.includes(selected)&&targetIdx!==-1&&(
                  <button onClick={handlePlay} style={th.btn("#27ae60")}>✅ Jouer</button>
                )}
                {drawn&&!discardMode&&(
                  <button onClick={()=>{setDiscardMode(true);setSelected(null);}} style={th.btn("#7f8c8d")}>🗑️ Défausser</button>
                )}
                {discardMode&&selected&&(
                  <button onClick={()=>handleDiscard(selected)} style={th.btn("#c0392b")}>🗑️ Jeter {getCard(selected)?.label}</button>
                )}
                {discardMode&&(
                  <button onClick={()=>{setDiscardMode(false);setSelected(null);}} style={th.btn("#7f8c8d")}>↩️ Annuler</button>
                )}
              </div>
            </div>

            {/* LOG */}
            <div style={{width:"200px",background:dark?"rgba(20,30,50,0.8)":"rgba(255,255,255,0.6)",border:"2px solid "+th.border,borderRadius:"10px",padding:"8px",maxHeight:"280px",overflowY:"auto",flexShrink:0}}>
              <div style={{fontSize:"10px",fontWeight:"bold",marginBottom:"4px",color:th.sub,textTransform:"uppercase"}}>Journal</div>
              {log.map((l,i)=>(
                <div key={i} style={{fontSize:"10px",padding:"2px 4px",borderBottom:"1px solid "+th.border,color:th.text,opacity:1-i*0.04}}>{l.text}</div>
              ))}
            </div>
          </div>

          {/* SCORES — LIGNES DE COURSE */}
          <div style={{background:th.cardBg,border:"2px solid "+th.border,borderRadius:"10px",padding:"8px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
              <div style={{fontSize:"10px",fontWeight:"bold",color:th.sub,textTransform:"uppercase"}}>Scores — Objectif : {SCORE_CIBLE} pts</div>
              <div style={{fontSize:"10px",color:th.sub}}>{SCORE_CIBLE-Math.max(0,...Object.values(totalScores))} restants</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
              {[...players].sort((a,b)=>(totalScores[b.name]||0)-(totalScores[a.name]||0)).map((p,rank)=>{
                const colors=["#8B0000","#1a5276","#1e8449","#7d6608"];
                const origIdx=players.findIndex(x=>x.name===p.name);
                const c=colors[origIdx%4];
                const s=totalScores[p.name]||0;
                const pct=s/SCORE_CIBLE*100;
                return(
                  <div key={p.name} style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"16px",fontSize:"11px",textAlign:"center"}}>
                      {rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":"4️⃣"}
                    </div>
                    <div style={{width:"80px",fontSize:"10px",fontWeight:"bold",color:c,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {p.emoji} {p.name}
                    </div>
                    <div style={{flex:1,position:"relative",height:"14px",background:th.barBg,borderRadius:"7px",overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:c,borderRadius:"7px",transition:"width 0.5s",minWidth:pct>0?"4px":"0"}}/>
                      {/* Petit drapeau à l'arrivée */}
                      <div style={{position:"absolute",right:"4px",top:"0",bottom:"0",display:"flex",alignItems:"center",fontSize:"8px",opacity:0.5}}>🏁</div>
                    </div>
                    <div style={{width:"38px",fontSize:"11px",fontWeight:"bold",color:c,textAlign:"right"}}>
                      {s}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ANIMATION CARTE */}
      {animCard&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,pointerEvents:"none",zIndex:90,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:cColor(animCard.id,dark),color:"#fff",borderRadius:"12px",padding:"12px 16px",textAlign:"center",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",border:"3px solid rgba(255,255,255,0.4)"}}>
            <div style={{fontSize:"28px",marginBottom:"4px"}}>{cEmoji(animCard.id)}</div>
            <div style={{fontSize:"12px",fontWeight:"bold"}}>{getCard(animCard.id)?.label}</div>
          </div>
        </div>
      )}

      {/* COUP-FOURRÉ */}
      {phase==="coup_fourre"&&coupFourreData&&coupFourreData.psAtTime[coupFourreData.defenderIdx]?.isHuman&&(
        <div style={mdlOverlay}>
          <div style={th.modal}>
            <div style={{fontSize:"32px",marginBottom:"8px"}}>⚡</div>
            <h2 style={{color:th.title,fontSize:"16px",marginBottom:"10px"}}>COUP-FOURRÉ !</h2>
            <p style={{fontSize:"12px",color:th.text,marginBottom:"16px"}}>
              {coupFourreData.psAtTime[coupFourreData.attackerIdx]?.name} vous attaque avec <strong>{getCard(coupFourreData.attaqueId)?.label}</strong>.<br/>
              Vous avez <strong>{getCard(coupFourreData.botteId)?.label}</strong> — jouez le Coup-Fourré ?
            </p>
            <div style={{display:"flex",gap:"10px",justifyContent:"center"}}>
              <button onClick={()=>handleCoupFourre(true)} style={th.btn("#27ae60")}>⚡ Coup-Fourré !</button>
              <button onClick={()=>handleCoupFourre(false)} style={th.btn("#7f8c8d")}>Ignorer</button>
            </div>
          </div>
        </div>
      )}

      {/* FIN DE MANCHE */}
      {mancheOver&&!gameOver&&(
        <div style={mdlOverlay}>
          <div style={th.modal}>
            <div style={{fontSize:"28px",marginBottom:"8px"}}>🏁</div>
            <h2 style={{color:th.title,fontSize:"15px",marginBottom:"12px"}}>{mancheOver.winner} remporte la manche {manche} !</h2>
            <div style={{marginBottom:"12px"}}>
              {Object.entries(mancheOver.scores).sort((a,b)=>b[1]-a[1]).map(([name,score])=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"4px 8px",borderBottom:"1px solid "+th.border}}>
                  <span style={{fontSize:"12px",fontWeight:"bold",color:name===mancheOver.winner?th.gold:th.text}}>{name}</span>
                  <span style={{fontSize:"12px",color:th.accent}}>+{score} → {mancheOver.total[name]}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:"11px",color:th.sub,marginBottom:"12px"}}>{SCORE_CIBLE-Math.max(...Object.values(mancheOver.total))} pts restants</div>
            <button onClick={nextManche} style={{...th.btn("#27ae60"),fontSize:"13px"}}>▶️ Manche {manche+1} !</button>
          </div>
        </div>
      )}

      {/* FIN DE PARTIE */}
      {gameOver&&(
        <div style={mdlOverlay}>
          <div style={th.modal}>
            <div style={{fontSize:"36px",marginBottom:"8px"}}>{gameOver.winner===playerName?"🏆":"😢"}</div>
            <h2 style={{color:th.title,fontSize:"16px",marginBottom:"12px"}}>
              {gameOver.winner===playerName?`Bravo ${playerName} !`:`${gameOver.winner} remporte la partie !`}
            </h2>
            <div style={{marginBottom:"16px"}}>
              {Object.entries(gameOver.total).sort((a,b)=>b[1]-a[1]).map(([name,score],i)=>(
                <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",borderBottom:"1px solid "+th.border,background:i===0?(dark?"rgba(212,172,13,0.1)":"rgba(212,172,13,0.05)"):"transparent"}}>
                  <span style={{fontSize:"13px",fontWeight:"bold",color:i===0?th.gold:th.text}}>{["🥇","🥈","🥉","4️⃣"][i]} {name}</span>
                  <span style={{fontSize:"13px",fontWeight:"bold",color:i===0?th.gold:th.accent}}>{score} pts</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setShowTirage(true)} style={th.btn()}>🔄 Rejouer</button>
              <button onClick={onBack} style={th.btn("#445566")}>🏠 Accueil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
