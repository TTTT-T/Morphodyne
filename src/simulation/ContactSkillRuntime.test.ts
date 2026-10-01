import {expect,it} from 'vitest';
import type {SensorPerception} from '../core/sensing';
import {ContactExperienceSearch,ContactSkillRuntime,type ContactSkillBinding} from './ContactSkillRuntime';
const binding:ContactSkillBinding={axes:[{actuatorId:'aim',connectionId:'joint',gain:2,damping:.2}],opposedSensors:[['top'],['bottom']],rangeSensors:['ray'],minimumGap:.015,contactParts:{top:'a',bottom:'b'},ownGeometry:{a:{kind:'sphere',radius:.002},b:{kind:'sphere',radius:.002}}};
function perception(channel:SensorPerception['channel'],sensorId:string,values:number[],tick:number,ownPartId?:string):SensorPerception {
 return {channel,sensorId,values,tick,expiresAtTick:tick+1,ownPartId,ownConnectionId:channel==='joint'?'joint':undefined,label:channel,confidence:1,uncertainty:[]};
}
const view=(tick:number,separation=.1)=>({tick,perceptions:[perception('joint','state',[0,0],tick),perception('range','ray',[1,0,0,.1],tick),perception('relative-pose','state',[0,separation/2,0,0,0,0,1],tick,'a'),perception('relative-pose','state',[0,-separation/2,0,0,0,0,1],tick,'b'),perception('contact','top',[0,-.01,0,.1],tick),perception('contact','bottom',[0,.01,0,.1],tick)]});
it('rejects self closure and own geometry while retaining separated contact feedback',()=>{
 const positive=new ContactSkillRuntime(binding,[.1]);positive.update(view(0));expect(positive.inspect().bilateralTicks).toBe(1);
 const closed=new ContactSkillRuntime(binding,[.1]);closed.update(view(0,.02));expect(closed.inspect().bilateralTicks).toBe(0);
 const obstructed=new ContactSkillRuntime({...binding,ownGeometry:{...binding.ownGeometry,c:{kind:'box',halfExtents:{x:.1,y:.1,z:.1}}}},[.1]);
 const frame=view(0);frame.perceptions.push(perception('relative-pose','state',[0,0,0,0,0,0,1],0,'c'));obstructed.update(frame);expect(obstructed.inspect().bilateralTicks).toBe(0);
});
it('does not count repeated, reversed or expired sensor frames as extra successes',()=>{
 const skill=new ContactSkillRuntime(binding,[.1]);const frame=view(3);skill.update(frame);skill.update(frame);skill.update(view(2));expect(skill.inspect().samples).toBe(1);
 skill.update({...frame,tick:10});expect(skill.inspect().bilateralTicks).toBe(1);expect(skill.inspect().feedbackTicks).toBe(1);
});
it('preserves measured initial strategy and aggregates beyond the bounded raw history',()=>{
 const search=new ContactExperienceSearch([[0],[1]],[0]);
 const sample=(parameters:number[],score:number)=>({parameters,samples:100,bilateralTicks:0,longestBilateralTicks:0,singleTicks:0,feedbackTicks:100,effort:0,score});
 search.record(sample([1],.9));expect(search.best()).toEqual([0]);search.record(sample([0],1));expect(search.best()).toEqual([0]);
 for(let i=0;i<150;i++)search.record(sample([1],2));expect(search.best()).toEqual([1]);expect(search.inspect()).toHaveLength(128);
});
it('changes its own commands after sensed slip and finite loss instead of repeating fixed closure',()=>{
 const twoAxis={...binding,axes:[{actuatorId:'aim',connectionId:'joint',gain:2,damping:.2},{actuatorId:'close',connectionId:'close-joint',gain:2,damping:.2}]};
 const skill=new ContactSkillRuntime(twoAxis,[.1,.55,1,.04,12,4,.003]);
 const frame=(tick:number,contact:boolean)=>{
  const result=view(tick);
  result.perceptions.push({...perception('joint','state',[.2,0],tick),ownConnectionId:'close-joint'});
  if(!contact)result.perceptions=result.perceptions.filter(p=>p.channel!=='contact');
  return result;
 };
 const held=skill.update(frame(0,true)).find(s=>s.actuatorId==='close')!.value;
 const slipped=frame(1,true);slipped.perceptions=slipped.perceptions.map(p=>p.channel==='range'?{...p,values:[1,0,0,.15]}:p);
 const boosted=skill.update(slipped).find(s=>s.actuatorId==='close')!.value;expect(boosted).toBeGreaterThan(held);
 let opened=false;for(let tick=2;tick<20;tick++)opened ||= skill.update(frame(tick,false)).some(s=>s.actuatorId==='close'&&s.value<0);
 expect(opened).toBe(true);expect(skill.inspect().retries).toBeGreaterThan(0);
});
