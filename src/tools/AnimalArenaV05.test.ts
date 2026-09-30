import { describe, expect, it } from 'vitest';
import type { Blueprint, Geometry, Material, Part, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { createLeopardBlueprint } from './LeopardBlueprint';
import { LeopardAgentRuntime } from './LeopardAgent';
import { createArenaSession } from './ArenaSession';

const v = (x=0,y=0,z=0): Vector3 => ({x,y,z});
const identity = {x:0,y:0,z:0,w:1};
const hard: Material = { id:'hard',density:1000,friction:1,restitution:0 };
const soft = (strong=false): Material => ({id:'sample',density:1000,friction:1,restitution:0,
  yieldPressurePa:strong ? 1e9 : 1e5, ultimatePressurePa:strong ? 2e9 : 2e6});
const part = (id:string, geometry:Geometry, position:Vector3, mass:number, materialId='hard'): Part =>
  ({id,geometry,mass,materialId,pose:{position,rotation:identity}});
const box = (x:number,y:number,z:number): Geometry => ({kind:'box',halfExtents:v(x,y,z)});
const single = (p:Part,m:Material): Blueprint => ({id:p.id,parts:[p],materials:[m],connections:[]});

async function impact(narrow:boolean,strong=false) {
  const physics = await RapierPhysicsAdapter.create();
  const world = new WorldRuntime(physics);
  physics.createBox({halfExtents:v(2,0.1,2),position:v(0,1.6,0),dynamic:false});
  world.spawn({id:'sample',blueprint:single(part('sample',box(0.3,0.3,0.3),v(0,2,0),20,'sample'),soft(strong))});
  world.spawn({id:'source',blueprint:single(part('source',narrow ? {kind:'capsule',radius:0.012,halfHeight:0.088} : box(0.15,0.1,0.15),v(0,3,0),1),hard)});
  world.applyImpact('source','source',v(0,-2,0));
  let peakForceN=0, impulseNs=0, peakPressurePa=0, effectiveAreaM2=0;
  for(let i=0;i<60;i++) {
    world.stepOnce();
    for(const patch of world.readPartContactLoad('sample','sample')!.patches ?? []) {
      if(patch.otherEntityId !== 'source') continue;
      impulseNs += patch.impulseNs;
      peakForceN = Math.max(peakForceN,patch.forceN);
      if(patch.pressurePa > peakPressurePa) { peakPressurePa=patch.pressurePa; effectiveAreaM2=patch.effectiveAreaM2; }
    }
  }
  return {peakForceN,impulseNs,peakPressurePa,effectiveAreaM2,damage:world.getDamageRuntime('sample').state.parts.sample.damage};
}

/** No Agent; one real hinge and an ordinary equal/opposite torque actuator. */
async function mechanicalJaw(strong=false, brittleMount=false) {
  const physics=await RapierPhysicsAdapter.create();
  physics.createBox({halfExtents:v(2,0.1,2),position:v(0,-0.1,0),dynamic:false});
  const world=new WorldRuntime(physics);
  const angle=-0.3, pivot=v(-0.5,1.3,0);
  const jawPosition=v(pivot.x+0.5*Math.cos(angle),pivot.y+0.5*Math.sin(angle),0);
  const lowerLocal=v(0.25,0.08,0);
  const lowerPosition=v(jawPosition.x+lowerLocal.x*Math.cos(angle)-lowerLocal.y*Math.sin(angle),jawPosition.y+lowerLocal.x*Math.sin(angle)+lowerLocal.y*Math.cos(angle),0);
  const upperPosition=v(0.25,1.44,0);
  const jawPart=part('jaw',box(0.5,0.04,0.15),jawPosition,1);
  const lower=part('lower', {kind:'sphere',radius:0.035},lowerPosition,0.05);
  const blueprint:Blueprint={id:'hinged-press',materials:[hard],parts:[
    part('frame',box(0.5,0.5,0.3),v(-0.65,0.5,0),200),
    part('upper',box(0.5,0.04,0.15),v(0,1.52,0),1),
    {...jawPart,pose:{...jawPart.pose,rotation:{x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}}},
    part('upper-tip',{kind:'sphere',radius:0.035},upperPosition,0.05),
    {...lower,pose:{...lower.pose,rotation:jawPart.pose.rotation}},
  ],connections:[
    {id:'upper-mount',kind:'rigid',fromPartId:'frame',toPartId:'upper',fromAnchor:v(0.65,1.02,0),toAnchor:v()},
    {id:'hinge',kind:'revolute',fromPartId:'frame',toPartId:'jaw',fromAnchor:v(0.15,0.8,0),toAnchor:v(-0.5,0,0),axis:v(0,0,1),limits:{min:0,max:0.7}},
    {id:'upper-tip-mount',kind:'rigid',fromPartId:'upper',toPartId:'upper-tip',fromAnchor:v(0.25,-0.08,0),toAnchor:v(),...(brittleMount?{strengthImpulseNs:0.01,yieldForceN:0.01,ultimateForceN:0.02}:{})},
    {id:'lower-tip-mount',kind:'rigid',fromPartId:'jaw',toPartId:'lower',fromAnchor:lowerLocal,toAnchor:v()},
  ],actuators:[{id:'close',connectionId:'hinge',maxOutput:8}]};
  world.spawn({id:'machine',blueprint},{energy:{capacityJ:1000,maxPowerWatts:1000,efficiency:1},control:()=>[{actuatorId:'close',value:1}]});
  world.spawn({id:'sample',blueprint:single(part('sample',box(0.12,0.045,0.13),v(0.25,1.35,0),0.1,'sample'),soft(strong))});
  let bilateralTicks=0,peakPressurePa=0,forceN=0;
  let firstDamageTick=-1;
  for(let tick=0;tick<120;tick++) {
    world.stepOnce();
    const patches=world.readPartContactLoad('sample','sample')!.patches ?? [];
    if(patches.some(p=>p.otherPartId==='upper-tip')&&patches.some(p=>p.otherPartId==='lower')) bilateralTicks++;
    for(const p of patches) { peakPressurePa=Math.max(peakPressurePa,p.pressurePa);forceN=Math.max(forceN,p.forceN); }
    if(firstDamageTick<0 && world.getDamageRuntime('sample').state.parts.sample.damage.state!=='intact') firstDamageTick=tick;
  }
  return {bilateralTicks,peakPressurePa,forceN,firstDamageTick,damage:world.getDamageRuntime('sample').state.parts.sample.damage,
    jawAngle:physics.readJointPosition(world.getPhysicsBody('machine'),'hinge'),
    mountConnected:world.getDamageRuntime('machine').state.connections['upper-tip-mount'].connected,
    components:world.listComponents().filter(c=>c.sourceEntityId==='machine').length};
}

async function leopardJaw(blunt=false,autonomous=false,brittleTeeth=false) {
  const physics=await RapierPhysicsAdapter.create();
  const world=new WorldRuntime(physics,{surfaces:[{id:'floor',halfExtents:v(8,0.1,8),position:v(0,-0.1,0),friction:1.4}]});
  const agent=new LeopardAgentRuntime();
  let jawAppliedOutput=0, peakJawOutputNm=0, jawTorqueIntegralNmS=0;
  const applyOutput=physics.applyJointOutput.bind(physics);
  physics.applyJointOutput=(body,id,output,axis)=> {
    if(id==='leopard-jaw-joint') jawAppliedOutput+=output;
    applyOutput(body,id,output,axis);
  };
  const original=createLeopardBlueprint({contactGeometry:blunt?'blunt':'toothed'});
  const blueprint = brittleTeeth ? { ...original, materials:original.materials.map(m=>m.id==='dense-contact-material'
    ? {...m,yieldPressurePa:1000,ultimatePressurePa:5000} : m) } : original;
  world.spawn({id:'body',blueprint},{energy:{capacityJ:12000,maxPowerWatts:650,efficiency:0.82},
    ...(autonomous ? {agent:{control:(seconds:number)=>agent.control(world.readSensorRuntime('body')?.readAgentView() ?? {tick:-1,perceptions:[]},seconds)}}
      : {control:()=>[{actuatorId:'leopard-jaw-close',value:1}]}),
  });
  world.spawn({id:'sample',blueprint:single(part('sample',box(0.045,0.02,0.22),v(1.925,1.15,0),0.05,'sample'),soft())});
  let bilateralTicks=0,peakPressurePa=0,effectiveAreaM2=0,peakForceN=0,toothTicks=0,interactTicks=0,jawOutputTicks=0;
  let minJawAngle=Infinity,maxJawAngle=-Infinity;
  let firstRangeTick=-1, firstInteractTick=-1, firstPressureTick=-1, firstDamageTick=-1, firstToothFractureTick=-1;
  for(let tick=0;tick<180;tick++) {
    world.stepOnce();
    const patches=(world.readPartContactLoad('sample','sample')!.patches ?? []).filter(p=>p.otherEntityId==='body');
    const teeth=patches.filter(p=>p.otherPartId?.endsWith('-tooth'));
    if(teeth.length) toothTicks++;
    if(teeth.some(p=>p.otherPartId?.includes('upper'))&&teeth.some(p=>p.otherPartId?.includes('lower'))) bilateralTicks++;
    for(const p of teeth) if(p.pressurePa>peakPressurePa) { peakPressurePa=p.pressurePa;effectiveAreaM2=p.effectiveAreaM2;peakForceN=p.forceN; }
    if(world.readSensorRuntime('body')?.readAgentView().perceptions.some(p=>p.channel==='range'&&p.values[3]<0.45) && firstRangeTick<0) firstRangeTick=tick;
    if(agent.inspect().skill==='interact') { interactTicks++; if(firstInteractTick<0) firstInteractTick=tick; }
    if(teeth.length && firstPressureTick<0) firstPressureTick=tick;
    if(world.getDamageRuntime('sample').state.parts.sample.damage.state!=='intact' && firstDamageTick<0) firstDamageTick=tick;
    if(Object.values(world.getDamageRuntime('body').state.parts).some(p=>p.partId.endsWith('-tooth') && p.damage.state==='fractured') && firstToothFractureTick<0) firstToothFractureTick=tick;
    if(jawAppliedOutput>0) jawOutputTicks++;
    peakJawOutputNm=Math.max(peakJawOutputNm,jawAppliedOutput);
    jawTorqueIntegralNmS+=jawAppliedOutput/60;
    jawAppliedOutput=0;
    const coordinate=physics.readJointPosition(world.getPhysicsBody('body'),'leopard-jaw-joint');
    minJawAngle=Math.min(minJawAngle,coordinate);maxJawAngle=Math.max(maxJawAngle,coordinate);
  }
  return {bilateralTicks,peakPressurePa,effectiveAreaM2,peakForceN,toothTicks,interactTicks,jawOutputTicks,minJawAngle,maxJawAngle,peakJawOutputNm,jawTorqueIntegralNmS,
    damage:world.getDamageRuntime('sample').state.parts.sample.damage,
    firstRangeTick,firstInteractTick,firstPressureTick,firstDamageTick,firstToothFractureTick,
    detachedTeeth:blueprint.parts.filter(p=>p.id.endsWith('-tooth')&&!world.getDamageRuntime('body').state.connections[`${p.id}-mount`].connected).map(p=>({id:p.id,pose:world.getPhysicsBody('body').readPartPose(p.id)})),
    componentCount:world.listComponents().filter(c=>c.sourceEntityId==='body').length};
}

describe('Animal Arena v0.5 physical contact concentration',()=>{
  it('A/B: controlled geometry and pressure-capacity comparisons',async()=>{
    const broad=await impact(false), narrow=await impact(true), strong=await impact(true,true);
    console.info('V05 A/B',JSON.stringify({broad,narrow,strong}));
    expect(narrow.peakForceN/broad.peakForceN).toBeGreaterThan(0.5);
    expect(narrow.peakForceN/broad.peakForceN).toBeLessThan(2);
    expect(narrow.effectiveAreaM2).toBeLessThan(broad.effectiveAreaM2/10);
    expect(narrow.peakPressurePa).toBeGreaterThan(broad.peakPressurePa*10);
    expect(narrow.damage.deformation).toBeGreaterThan(broad.damage.deformation);
    expect(narrow.peakPressurePa).toBeCloseTo(strong.peakPressurePa,3);
    expect(strong.damage.state).toBe('intact');
    expect(narrow.damage.state).toBe('fractured');
  });
  it('C: generic mechanical jaw makes bilateral loaded contact and material damage',async()=>{
    const weak=await mechanicalJaw(),strong=await mechanicalJaw(true),separated=await mechanicalJaw(true,true);
    console.info('V05 C',JSON.stringify({weak,strong,separated}));
    expect(weak.bilateralTicks).toBeGreaterThan(0);
    expect(weak.jawAngle).toBeGreaterThan(0.05);
    expect(weak.peakPressurePa).toBeGreaterThan(1e5);
    expect(weak.damage.deformation).toBeGreaterThan(strong.damage.deformation);
    expect(strong.damage.state).toBe('intact');
    expect(separated.mountConnected).toBe(false);
    expect(separated.components).toBeGreaterThan(1);
  });
  it('D/E: same Leopard jaw output and materials, toothed vs blunt geometry',async()=>{
    const toothed=await leopardJaw(),blunt=await leopardJaw(true);
    console.info('V05 D/E',JSON.stringify({toothed,blunt}));
    expect(toothed.peakJawOutputNm).toBeCloseTo(blunt.peakJawOutputNm,10);
    expect(toothed.jawTorqueIntegralNmS).toBeCloseTo(blunt.jawTorqueIntegralNmS,10);
    expect(toothed.toothTicks).toBeGreaterThan(0);
    expect(toothed.bilateralTicks).toBeGreaterThan(0);
    expect(toothed.effectiveAreaM2).toBeLessThan(blunt.effectiveAreaM2);
    expect(toothed.peakPressurePa).toBeGreaterThan(blunt.peakPressurePa);
    expect(toothed.damage.deformation).toBeGreaterThan(blunt.damage.deformation);
    expect(toothed.jawOutputTicks).toBeGreaterThan(0);
  });
  it('F: anonymous sensors drive interact, jaw torque and physical tooth pressure',async()=>{
    const autonomous=await leopardJaw(false,true);
    console.info('V05 F',JSON.stringify(autonomous));
    expect(autonomous.interactTicks).toBeGreaterThan(0);
    expect(autonomous.jawOutputTicks).toBeGreaterThan(0);
    expect(autonomous.toothTicks).toBeGreaterThan(0);
    expect(autonomous.peakPressurePa).toBeGreaterThan(0);
    expect(autonomous.damage.deformation).toBeGreaterThan(0);
  });
  it('physical teeth fracture and lose their rigid mounting through the generic damage path',async()=>{
    const fragile=await leopardJaw(false,false,true);
    console.info('V05 tooth separation',JSON.stringify(fragile));
    expect(fragile.firstToothFractureTick).toBeGreaterThanOrEqual(0);
    expect(fragile.detachedTeeth.length).toBeGreaterThan(0);
    expect(fragile.componentCount).toBeGreaterThan(1);
    for(const tooth of fragile.detachedTeeth) expect(Object.values(tooth.pose.position).every(Number.isFinite)).toBe(true);
  });
  it('G: independent arena Agents use physical teeth without guaranteed hits',async()=>{
    const {world,agents}=await createArenaSession();
    let toothContactTicks=0,peakPressurePa=0,interactTicks=0;
    for(let tick=0;tick<600;tick++) {
      world.stepOnce();
      if([...agents.values()].some(a=>a.inspect().skill==='interact')) interactTicks++;
      let hit=false;
      for(const id of ['leopard-a','leopard-b']) for(const part of world.readBlueprint(id).parts.filter(p=>p.id.endsWith('-tooth'))) {
        for(const p of world.readPartContactLoad(id,part.id)?.patches ?? []) {
          if(p.otherEntityId && p.otherEntityId!==id) {hit=true;peakPressurePa=Math.max(peakPressurePa,p.pressurePa);}
        }
      }
      if(hit) toothContactTicks++;
    }
    const damages=['leopard-a','leopard-b'].map(id=>Object.values(world.getDamageRuntime(id).state.parts).filter(p=>p.damage.state!=='intact').map(p=>({partId:p.partId,...p.damage})));
    console.info('V05 G',JSON.stringify({interactTicks,toothContactTicks,peakPressurePa,damages}));
    expect(interactTicks).toBeGreaterThan(0);
    expect(toothContactTicks).toBeGreaterThan(0);
    expect(peakPressurePa).toBeGreaterThan(0);
  });
});
