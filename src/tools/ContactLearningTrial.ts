import type { Blueprint, Material, Part, Sensor, Vector3 } from '../core/model';
import { RapierPhysicsAdapter } from '../physics/RapierPhysicsAdapter';
import { WorldRuntime } from '../simulation/WorldRuntime';
import { ContactSkillRuntime, type ContactSkillBinding } from '../simulation/ContactSkillRuntime';
import { createLeopardBlueprint } from './LeopardBlueprint';
import { LeopardAgentRuntime } from './LeopardAgent';
import {withBodyContactSensors,bodyContactBinding,withFrontContactParts} from './BodyContactBinding';
import { hasSimultaneousContact } from './contactMeasurement';

const v = (x=0,y=0,z=0): Vector3 => ({x,y,z});
const rotation = {x:0,y:0,z:0,w:1};
const pose = (position:Vector3) => ({position,rotation});
const box = (x:number,y:number,z:number): Part['geometry'] => ({kind:'box',halfExtents:v(x,y,z)});
const material:Material={id:'solid',density:1000,friction:1,restitution:0};
const part=(id:string,geometry:Part['geometry'],position:Vector3,mass:number):Part=>({id,geometry,pose:pose(position),mass,materialId:'solid'});
const sensor=(id:string,partId:string):Sensor=>({id,partId,kind:'contact',localPose:pose(v()),forward:v(1),updatePeriodTicks:1,latencyTicks:0,noise:{standardDeviation:0},range:0.06,resolution:10000});

export type ContactTrialKind = 'machine' | 'body' | 'free-body' | 'extended-body' | 'extended-free-body';
export interface ContactTrialOffset { readonly x:number; readonly y:number; readonly z:number; }
export const CONTACT_TRAIN_OFFSETS:readonly ContactTrialOffset[]=[v(0,0,0),v(-0.03,0.01,0.01),v(0.03,-0.01,-0.01)];
export const CONTACT_TEST_OFFSETS:readonly ContactTrialOffset[]=[-0.06,0.06].flatMap(x=>[-0.02,0.02].flatMap(y=>[-0.025,0.025].map(z=>v(x,y,z))));
export const CONTACT_INITIAL_PARAMETERS = [0.25,0.30] as const;
export const CONTACT_CANDIDATES = [CONTACT_INITIAL_PARAMETERS, ...[-0.15,-0.075,0,0.075,0.15,0.25].flatMap(aim => [0.12,0.25,0.4,0.55].map(close => [aim,close]))];

function mechanism():Blueprint {
  const angle=-0.3, pivot=v(-0.5,1.3);
  const jaw=v(pivot.x+0.5*Math.cos(angle),pivot.y+0.5*Math.sin(angle));
  const local=v(0.25,0.08);
  return {id:'two-axis-contact-chain',materials:[material],parts:[
    part('frame',box(0.5,0.5,0.3),v(-0.65,0.5),200),part('upper',box(0.5,0.04,0.15),v(0,1.52),1),
    {...part('jaw',box(0.5,0.04,0.15),jaw,1),pose:{position:jaw,rotation:{x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}}},
    part('upper-tip',{kind:'sphere',radius:0.035},v(0.25,1.44),0.05),
    {...part('lower-tip',{kind:'sphere',radius:0.035},v(jaw.x+local.x*Math.cos(angle)-local.y*Math.sin(angle),jaw.y+local.x*Math.sin(angle)+local.y*Math.cos(angle)),0.05),pose:{position:v(jaw.x+local.x*Math.cos(angle)-local.y*Math.sin(angle),jaw.y+local.x*Math.sin(angle)+local.y*Math.cos(angle)),rotation:{x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}}},
  ],connections:[
    {id:'aim',kind:'revolute',fromPartId:'frame',toPartId:'upper',fromAnchor:v(0.15,1.02),toAnchor:v(-0.5),axis:v(0,0,1),limits:{min:-0.4,max:0.4},passiveAngular:[{axis:v(0,0,1),restAngle:0,stiffnessNmPerRad:38,dampingNmsPerRad:4}]},
    {id:'close',kind:'revolute',fromPartId:'upper',toPartId:'jaw',fromAnchor:v(-0.5,-0.22),toAnchor:v(-0.5),axis:v(0,0,1),limits:{min:0,max:0.7}},
    {id:'upper-mount',kind:'rigid',fromPartId:'upper',toPartId:'upper-tip',fromAnchor:v(0.25,-0.08),toAnchor:v()},
    {id:'lower-mount',kind:'rigid',fromPartId:'jaw',toPartId:'lower-tip',fromAnchor:local,toAnchor:v()},
  ],actuators:[{id:'aim-drive',connectionId:'aim',maxOutput:24},{id:'close-drive',connectionId:'close',maxOutput:18}],sensors:[
    sensor('upper-touch','upper-tip'),sensor('lower-touch','lower-tip'),
    {id:'state',kind:'proprioception',partId:'frame',localPose:pose(v()),forward:v(1),updatePeriodTicks:1,latencyTicks:0,noise:{standardDeviation:0},resolution:1000},
    {id:'near',kind:'range',partId:'upper',localPose:pose(v(0.08,-0.23)),forward:v(1,0),updatePeriodTicks:1,latencyTicks:0,noise:{standardDeviation:0},range:0.6,fieldOfViewRadians:0.4,resolution:3},
  ]};
}
function bodyChain(free=false,extended=false):Blueprint {
  const original=createLeopardBlueprint();
  const full=extended?withFrontContactParts(original):original;
  const ids=new Set(['leopard-chest','leopard-neck','leopard-head','leopard-jaw',...full.parts.filter(p=>p.id.endsWith('-tooth')).map(p=>p.id)]);
  if(free)for(const part of full.parts)ids.add(part.id);
  return {...full,id:free?'free-body-contact':'body-contact-chain',parts:full.parts.filter(p=>ids.has(p.id)).map(p=>!free&&p.id==='leopard-chest'?{...p,mass:200}:p),
    connections:full.connections.filter(c=>ids.has(c.fromPartId)&&ids.has(c.toPartId)),
    actuators:full.actuators?.filter(a=>free||a.id==='leopard-neck-pitch'||a.id==='leopard-jaw-close'),
    sensors:withBodyContactSensors({...full,sensors:(full.sensors??[]).filter(s=>free||s.kind==='proprioception'||s.id==='leopard-mouth-range')}).sensors};
}
function binding(kind:ContactTrialKind):ContactSkillBinding {
  const blueprint=kind==='machine'?mechanism():bodyChain(kind.endsWith('free-body'),kind.startsWith('extended-'));
  const ownGeometry=Object.fromEntries(blueprint.parts.map(p=>[p.id,p.geometry]));
  return kind==='machine'?{axes:[{actuatorId:'aim-drive',connectionId:'aim',gain:1.8,damping:0.28},{actuatorId:'close-drive',connectionId:'close',gain:2,damping:0.28}],opposedSensors:[['upper-touch'],['lower-touch']],rangeSensors:['near'],contactParts:{'upper-touch':'upper-tip','lower-touch':'lower-tip'},minimumGap:0.015,ownGeometry}
    :bodyContactBinding(blueprint);
}
export async function createContactLearningTrial(kind:ContactTrialKind,offset:ContactTrialOffset,parameters:readonly number[],empty:boolean|'self'|'wall'|'ground'=false,disturbance?:ContactDisturbance) {
  const physics=await RapierPhysicsAdapter.create();
  const world=new WorldRuntime(physics,{surfaces:[{id:'floor',halfExtents:v(4,0.1,4),position:v(0,-0.1),friction:1.4},...(empty==='wall'?[{id:'negative-wall',halfExtents:v(0.02,0.6,0.4),position:v(kind==='machine'?0.29:1.96,1.3),friction:1}]:[]),...(empty==='ground'?[{id:'negative-ground',halfExtents:v(4,0.1,4),position:v(0,1.15),friction:1}]:[]),...(kind.endsWith('body')&&!kind.endsWith('free-body')?[{id:'passive-base-support',halfExtents:v(0.7,0.1,0.45),position:v(0.25,0.53),friction:1.4}]:[])]});
  const blueprint=kind==='machine'?mechanism():bodyChain(kind.endsWith('free-body'),kind.startsWith('extended-'));
  const support=kind.endsWith('free-body')?new LeopardAgentRuntime('traction',{}, {evaluate:()=>({goal:{kind:'maintain-stability',desiredState:'hold posture while using a local chain'},affordance:{id:'posture',goalKind:'maintain-stability',skill:'stand'}})}):undefined;
  const ownBinding=binding(kind);
  const skill=new ContactSkillRuntime(ownBinding,parameters);
  const control = (seconds:number) => {
    const view=world.readSensorRuntime('chain')?.readAgentView()??{tick:-1,perceptions:[]};
    return [...(support?.control(view,seconds)??[]).filter(s=>s.actuatorId!=='leopard-neck-pitch'&&s.actuatorId!=='leopard-jaw-close'),...skill.update(view)];
  };
  world.spawn({id:'chain',blueprint},{energy:{capacityJ:12000,maxPowerWatts:650,efficiency:0.82},
    ...(kind==='machine'?{control}:{agent:{control}})});
  const center=kind==='machine'?v(0.25,1.35):v(1.925,1.15);
  if(!empty)world.spawn({id:'sample',blueprint:{id:'independent-sample',materials:[material],parts:[part('sample',kind==='machine'?box(0.12,0.045,0.13):box(0.045,0.02,0.22),v(center.x+offset.x,center.y+offset.y,offset.z),0.1)],connections:[]}});
  const opposed=kind==='machine'?[['upper-tip'],['lower-tip']]:[blueprint.parts.filter(p=>p.id.includes('-upper-')&&p.id.endsWith('-tooth')).map(p=>p.id),blueprint.parts.filter(p=>p.id.includes('-lower-')&&p.id.endsWith('-tooth')).map(p=>p.id)];
  let bilateral=0,longest=0,streak=0,any=0,postStreak=0,postLongest=0,firstRecovery=-1;
  const sample=()=>{
    const patches=empty?[]:world.readPartContactLoad('sample','sample')?.patches??[];
    const connected=new Set(world.inspectComponent('chain')?.partIds??[]);
    const joints=world.readSensorRuntime('chain')?.readAgentView().perceptions.filter(p=>p.channel==='joint').map(p=>p.ownConnectionId)??[];
    const controllable=ownBinding.axes.every(a=>joints.includes(a.connectionId));
    const sides=opposed.map(ids=>controllable?patches.filter(p=>p.otherEntityId==='chain'&&ids.includes(p.otherPartId??'')&&connected.has(p.otherPartId??'')&&p.forceN>0.1):[]);
    any+=Number(sides.some(side=>side.length>0));
    const hit=hasSimultaneousContact(sides[0],sides[1]);bilateral+=Number(hit);streak=hit?streak+1:0;longest=Math.max(longest,streak);
    if(disturbance && world.tick>disturbance.tick){
      postStreak=hit?postStreak+1:0;postLongest=Math.max(postLongest,postStreak);
      if(postStreak===30 && firstRecovery<0)firstRecovery=world.tick-disturbance.tick-30;
    }
  };
  const step=()=>{if(disturbance && world.tick===disturbance.tick)world.applyImpact('sample','sample',disturbance.impulse);world.stepOnce();sample();};
  return {world,physics,skill,sample,step,inspect:()=>({bilateralTicks:bilateral,longestBilateralTicks:longest,anyTicks:any,postLongestBilateralTicks:postLongest,recoveryTicks:firstRecovery,energyJ:world.inspectEnergy('chain')!.consumedEnergyJ,experience:skill.inspect()})};
}
export interface ContactDisturbance { readonly tick:number; readonly impulse:Vector3; }
export async function runContactTrial(kind:ContactTrialKind,offset:ContactTrialOffset,parameters:readonly number[],empty:boolean|'self'|'wall'|'ground'=false,disturbance?:ContactDisturbance) {
  const trial=await createContactLearningTrial(kind,offset,parameters,empty,disturbance);
  try {
    for(let tick=0;tick<180;tick++)trial.step();
    return trial.inspect();
  } finally {trial.physics.dispose();}
}

export async function trainContactSkill(kind:ContactTrialKind, progress?:(completed:number,total:number)=>void) {
  const {ContactExperienceSearch}=await import('../simulation/ContactSkillRuntime');
  const candidates=kind==='machine'?CONTACT_CANDIDATES:[...CONTACT_CANDIDATES,...[3,6,10].flatMap(speed=>CONTACT_CANDIDATES.map(p=>[...p,speed]))];
  const search=new ContactExperienceSearch(candidates,CONTACT_INITIAL_PARAMETERS);
  let completed=0;
  for(const parameters of candidates)for(const offset of CONTACT_TRAIN_OFFSETS){
    const result=await runContactTrial(kind,offset,parameters);
    search.record(result.experience);
    progress?.(++completed,candidates.length*CONTACT_TRAIN_OFFSETS.length);
    if(completed%3===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {parameters:search.best(),experiences:search.inspect(),candidateScores:search.inspectScores()};
}

export const CONTACT_TRAIN_DISTURBANCES:readonly ContactDisturbance[]=[{tick:35,impulse:v(.8,.08,0)},{tick:50,impulse:v(.8,-.08,0)}];
export const contactTestDisturbances=(offset:ContactTrialOffset):readonly ContactDisturbance[]=>[60,75].map(tick=>({tick,impulse:v(.8,0,offset.z<0?-.08:.08)}));
export const CONTACT_CURRICULUM_OFFSETS:readonly ContactTrialOffset[]=[...CONTACT_TRAIN_OFFSETS,v(.045,-.03,.015),v(.055,0,-.015),v(.075,.03,.015)];
export const CONTACT_CURRICULUM_DISTURBANCES:readonly ContactDisturbance[]=[{tick:35,impulse:v(.85,.1,.04)},{tick:55,impulse:v(.7,-.05,-.04)}];
export async function trainDisturbedContact(kind:ContactTrialKind='extended-body',progress?:(completed:number,total:number)=>void,protocol:'v1'|'v2'='v2'){
 const {ContactExperienceSearch}=await import('../simulation/ContactSkillRuntime');
 const candidates=[CONTACT_INITIAL_PARAMETERS,...[-.15,.075,.25].flatMap(aim=>[.3,.55,.7].flatMap(close=>[1,2,3].flatMap(response=>[.04,.08,.15].map(margin=>[aim,close,response,margin,12,4,.003]))))];
 const search=new ContactExperienceSearch(candidates,CONTACT_INITIAL_PARAMETERS);let completed=0;
 const offsets=protocol==='v1'?CONTACT_TRAIN_OFFSETS:CONTACT_CURRICULUM_OFFSETS;
 const disturbances=protocol==='v1'?CONTACT_TRAIN_DISTURBANCES:CONTACT_CURRICULUM_DISTURBANCES;
 for(const parameters of candidates)for(const offset of offsets)for(const disturbance of disturbances){
  const result=await runContactTrial(kind,offset,parameters,false,disturbance);search.record(result.experience);
  progress?.(++completed,candidates.length*offsets.length*disturbances.length);
  if(completed%6===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {parameters:search.best(),experiences:search.inspect(),candidateScores:search.inspectScores()};
}
