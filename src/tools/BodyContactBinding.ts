import type { Blueprint, Sensor } from '../core/model';
import type { ContactSkillBinding } from '../simulation/ContactSkillRuntime';

/** Fixture wiring only. Physical Parts, joints and capacities remain exactly as supplied. */
export function withBodyContactSensors(body: Blueprint): Blueprint {
  const sensors: Sensor[] = body.parts.filter(p => p.id.endsWith('-tooth')).map(p => ({
    id:p.id+'-touch',partId:p.id,kind:'contact',localPose:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1}},
    forward:{x:1,y:0,z:0},updatePeriodTicks:1,latencyTicks:0,noise:{standardDeviation:0},range:0.06,resolution:10000,
  }));
  sensors.push({id:'gap-range',partId:'leopard-head',kind:'range',localPose:{position:{x:0.24,y:-0.13,z:0},rotation:{x:0,y:0,z:0,w:1}},
    forward:{x:1,y:0,z:0},updatePeriodTicks:1,latencyTicks:0,noise:{standardDeviation:0},range:0.6,fieldOfViewRadians:0.5,resolution:5});
  return {...body,sensors:[...(body.sensors??[]).map(s=>s.kind==='proprioception'?{...s,resolution:10000}:s),...sensors]};
}

export function bodyContactBinding(body: Blueprint): ContactSkillBinding {
  return {
    axes:[{actuatorId:'leopard-neck-pitch',connectionId:'leopard-neck-joint',gain:1.8,damping:0.28},
      {actuatorId:'leopard-jaw-close',connectionId:'leopard-jaw-joint',gain:2,damping:0.28}],
    opposedSensors:[body.parts.filter(p=>p.id.includes('-upper-')&&p.id.endsWith('-tooth')).map(p=>p.id+'-touch'),body.parts.filter(p=>p.id.includes('-lower-')&&p.id.endsWith('-tooth')).map(p=>p.id+'-touch')],
    rangeSensors:['gap-range'],minimumGap:0.015,
    contactParts:Object.fromEntries(body.parts.filter(p=>p.id.endsWith('-tooth')).map(p=>[p.id+'-touch',p.id])),
    ownGeometry:Object.fromEntries(body.parts.map(p=>[p.id,p.geometry])),
  };
}

/** Optional contact fixture: extends the same physical contact surfaces along the bare front ledge. */
export function withFrontContactParts(body:Blueprint):Blueprint {
  const originals=body.parts.filter(p=>p.id.endsWith('-tooth'));
  const extra=originals.map(p=>({...p,id:p.id.replace('-tooth','-front-tooth'),pose:{...p.pose,position:{...p.pose.position,x:p.pose.position.x+0.075*(p.pose.position.x>0?1:-1)}}}));
  const mounts=originals.map(p=>{
    const mount=body.connections.find(c=>c.toPartId===p.id)!;
    return {...mount,id:mount.id.replace('-tooth','-front-tooth'),toPartId:p.id.replace('-tooth','-front-tooth'),fromAnchor:{...mount.fromAnchor,x:mount.fromAnchor.x+0.075}};
  });
  return {...body,id:body.id+'-front-contact',parts:[...body.parts,...extra],connections:[...body.connections,...mounts]};
}
