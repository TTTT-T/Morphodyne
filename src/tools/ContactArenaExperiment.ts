import {createArenaSession} from './ArenaSession';
/** External measurements only. None of these reads are supplied to the controllers. */
export async function runContactArenaExperiment(parameters?:readonly number[],frontContact=false,ticks=600){
 const session=await createArenaSession(parameters,frontContact);const {world,agents}=session;
 let interactTicks=0,toothTicks=0,rawToothTicks=0,rawPeakPressurePa=0,peakPressurePa=0,bilateralTicks=0,longest=0;const streaks=new Map<string,number>();
 const stability:Record<string,number>={};
 try{
  for(let tick=0;tick<ticks;tick++){
   world.stepOnce();
   if([...agents.values()].some(a=>a.inspect().skill==='interact'))interactTicks++;
   let loaded=false,rawLoaded=false,bilateral=false;
   for(const id of ['leopard-a','leopard-b']){
    const opponent=id==='leopard-a'?'leopard-b':'leopard-a';
    const connected=new Set(world.inspectComponent(id)?.partIds??[]);
    const view=world.readSensorRuntime(id)?.readAgentView();
    const joints=new Set(view?.perceptions.filter(p=>p.channel==='joint').map(p=>p.ownConnectionId));
    const usable=joints.has('leopard-neck-joint')&&joints.has('leopard-jaw-joint');
    const sides=new Set<string>();
    const agent=agents.get(id)!.inspect();stability[agent.stability]=(stability[agent.stability]??0)+1;
    for(const part of world.readBlueprint(id).parts.filter(p=>p.id.endsWith('-tooth'))){
     for(const patch of world.readPartContactLoad(id,part.id)?.patches??[]){
      if(patch.otherEntityId!==opponent)continue;
      rawLoaded=true;rawPeakPressurePa=Math.max(rawPeakPressurePa,patch.pressurePa);
      if(!usable || !connected.has(part.id) || patch.forceN<=.1)continue;
      loaded=true;peakPressurePa=Math.max(peakPressurePa,patch.pressurePa);
      sides.add(part.id.includes('-upper-')?'upper':'lower');
     }
    }
    const ownBilateral=sides.size===2;
    const ownStreak=ownBilateral?(streaks.get(id)??0)+1:0;streaks.set(id,ownStreak);longest=Math.max(longest,ownStreak);
    bilateral ||= ownBilateral;
   }
   rawToothTicks+=Number(rawLoaded);toothTicks+=Number(loaded);bilateralTicks+=Number(bilateral);
  }
  return {ticks,interactTicks,toothTicks,rawToothTicks,rawPeakPressurePa,peakPressurePa,bilateralTicks,longestBilateralTicks:longest,stability,
   energyJ:['leopard-a','leopard-b'].map(id=>world.inspectEnergy(id)!.consumedEnergyJ),
   damages:['leopard-a','leopard-b'].map(id=>({id,parts:Object.values(world.getDamageRuntime(id).state.parts).filter(p=>p.damage.state!=='intact').map(p=>({id:p.partId,...p.damage})),contactExperience:agents.get(id)!.inspectContactExperience()}))};
 }finally{session.dispose();}
}
