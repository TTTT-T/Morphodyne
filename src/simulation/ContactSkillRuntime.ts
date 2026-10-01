import { createControlSignal, type ControlSignal } from '../core/actuation';
import type { Part } from '../core/model';
import type { AgentPerceptionView } from '../core/sensing';

export interface ContactAxisBinding { readonly actuatorId: string; readonly connectionId: string; readonly gain: number; readonly damping: number; }
export interface ContactSkillBinding {
  readonly axes: readonly ContactAxisBinding[];
  readonly opposedSensors: readonly [readonly string[], readonly string[]];
  readonly rangeSensors: readonly string[];
  /** Sensor mounts expressed in each sensed own Part's frame. */
  readonly contactParts: Readonly<Record<string, string>>;
  readonly minimumGap: number;
  readonly ownGeometry: Readonly<Record<string, Part['geometry']>>;
}
export interface ContactExperience {
  readonly parameters: readonly number[];
  readonly samples: number;
  readonly bilateralTicks: number;
  readonly longestBilateralTicks: number;
  readonly singleTicks: number;
  readonly feedbackTicks: number;
  readonly effort: number;
  readonly score: number;
  readonly retries?: number;
}

/** Only own joints and anonymous local sensors are reachable. No observer/world is supplied. */
export class ContactSkillRuntime {
  private lastTick = -1;
  private nearTick = -Infinity;
  private samples = 0;
  private bilateral = 0;
  private longest = 0;
  private streak = 0;
  private single = 0;
  private feedback = 0;
  private effort = 0;
  private hadContact = false;
  private lostTicks = 0;
  private retries = 0;
  private retryRemaining = 0;
  private lastSignals: readonly ControlSignal[] = [];
  private lastRange: number | undefined;
  private slipTicks = 0;
  constructor(readonly binding: ContactSkillBinding, readonly parameters: readonly number[]) {
    if (parameters.length < binding.axes.length || parameters.some(p => !Number.isFinite(p))) throw new Error('Invalid contact parameters');
    if(parameters[2]!==undefined && (parameters[2]<=0 || parameters[2]>10))throw new Error('Invalid response multiplier');
    this.parameters=[...parameters];
  }
  update(view: AgentPerceptionView): readonly ControlSignal[] {
    if(view.tick<this.lastTick)return [];
    const current = view.perceptions.filter(p => p.tick <= view.tick && p.expiresAtTick >= view.tick);
    const joints = new Map(current.filter(p => p.channel === 'joint').map(p => [p.ownConnectionId, p.values]));
    if(view.tick<0)return [];
    if(view.tick===this.lastTick)return this.lastSignals;
    if(view.tick-this.lastTick>2){this.lastRange=undefined;this.slipTicks=0;this.hadContact=false;this.lostTicks=0;this.retryRemaining=0;this.streak=0;}
    this.lastTick=view.tick;
    if (current.some(p => p.channel === 'range' && this.binding.rangeSensors.includes(p.sensorId) && p.values[3] >= 0 && p.values[3] < 0.5)) this.nearTick = view.tick;
    const distances=current.filter(p=>p.channel==='range' && this.binding.rangeSensors.includes(p.sensorId)).map(p=>p.values[3]);
    const range=distances.length?Math.min(...distances):undefined;
    if(this.parameters[6]!==undefined && range!==undefined && this.lastRange!==undefined && range-this.lastRange>this.parameters[6])this.slipTicks=8;
    this.lastRange=range;
    const poses = new Map(current.filter(p => p.channel === 'relative-pose').map(p => [p.ownPartId, p.values]));
    const transform = (p: readonly number[], q: readonly number[], inverse=false): number[] => {
      const [x,y,z] = p; const sign=inverse?-1:1;
      const qx=q[3]*sign,qy=q[4]*sign,qz=q[5]*sign,qw=q[6];
      const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
      return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
    };
    const points = this.binding.opposedSensors.map((ids, group) => current.filter(p => p.channel === 'contact'
      && ids.includes(p.sensorId) && p.values[3] > 0.0001 && p.values[1] * (group === 0 ? -1 : 1) > 0.002)
      .flatMap(p => {
        const owner=this.binding.contactParts[p.sensorId], pose = poses.get(owner);
        if (!pose || pose.length !== 7 || pose.some(n => !Number.isFinite(n))) return [];
        const point=transform(p.values,pose).map((n,i)=>n+pose[i]);
        const selfContact=Object.entries(this.binding.ownGeometry).some(([part,geometry])=>{
          if(part===owner)return false;
          const ownPose=poses.get(part);if(!ownPose)return false;
          const [x,y,z]=transform(point.map((n,i)=>n-ownPose[i]),ownPose,true);
          const margin=0.002;
          if(geometry.kind==='box')return Math.abs(x)<=geometry.halfExtents.x+margin&&Math.abs(y)<=geometry.halfExtents.y+margin&&Math.abs(z)<=geometry.halfExtents.z+margin;
          if(geometry.kind==='sphere')return Math.hypot(x,y,z)<=geometry.radius+margin;
          if(geometry.kind==='capsule')return Math.hypot(x,Math.max(0,Math.abs(y)-geometry.halfHeight),z)<=geometry.radius+margin;
          // Conservative convex bounds reject ambiguous contact rather than rewarding it.
          return [x,y,z].every((n,i)=>{const key=(['x','y','z'] as const)[i];const values=geometry.points.map(p=>p[key]);return n>=Math.min(...values)-margin&&n<=Math.max(...values)+margin;});
        });
        return selfContact?[]:[point];
      }));
    const forwardCenters=Object.values(this.binding.contactParts).flatMap(id=>{const pose=poses.get(id);return pose?[pose[0]]:[];});
    const frontEdge=forwardCenters.length>0 && points.some(side=>side.some(point=>point[0]>Math.max(...forwardCenters)-.025));
    const contacts = points.map(p => p.length > 0);
    // Direct self closure produces coincident contact points; an intervening object separates them.
    const separated = points[0].some(a => points[1].some(b => {
      const distance = Math.hypot(...a.map((n,i) => n-b[i]));
      return distance > this.binding.minimumGap && distance < 0.18 && Math.abs(a[2]-b[2]) < 0.08;
    }));
    const valid = view.tick - this.nearTick <= 60 && this.binding.axes.every(a=>{const m=joints.get(a.connectionId);return m && Number.isFinite(m[0]) && Number.isFinite(m[1]);});
    const bilateral = valid && contacts.every(Boolean) && separated;
    if(bilateral){this.hadContact=true;this.lostTicks=0;this.retryRemaining=0;}
    else if(this.hadContact)this.lostTicks++;
    const retryPeriod=this.parameters[4]??0;
    if(valid && retryPeriod>0 && this.lostTicks>=6 && this.retryRemaining===0 && this.lostTicks%(retryPeriod+6)===6){this.retryRemaining=retryPeriod;this.retries++;}
    const signals:ControlSignal[]=[];
    for(const [i,axis] of this.binding.axes.entries()){
      const measured=joints.get(axis.connectionId);
      if(!measured || !Number.isFinite(measured[0]) || !Number.isFinite(measured[1]))continue;
      let target=this.parameters[i];
      if(this.parameters[3]!==undefined && i===1){
        if(bilateral && this.slipTicks===0)target=Math.min(target,measured[0]+this.parameters[3]*(frontEdge?(this.parameters[5]??1):1));
        else if(this.retryRemaining>0)target=measured[0]-.12;
      }
      if(i===0 && this.retryRemaining>0)target+=.08*Math.sin(this.lostTicks*.2);
      signals.push(createControlSignal(axis.actuatorId,Math.max(-1,Math.min(1,
        axis.gain*(this.parameters[2]??1)*(target-measured[0])-axis.damping*Math.sqrt(this.parameters[2]??1)*measured[1]))));
    }
    if(this.retryRemaining>0)this.retryRemaining--;
    if(this.slipTicks>0)this.slipTicks--;
    this.lastSignals=signals;
    this.samples++;
    this.feedback += Number(signals.length === this.binding.axes.length);
    this.bilateral += Number(bilateral);
    this.single += Number(valid && contacts.some(Boolean));
    this.streak = bilateral ? this.streak + 1 : 0;
    this.longest = Math.max(this.longest, this.streak);
    this.effort += signals.reduce((sum, s) => sum + s.value * s.value, 0);
    return signals;
  }
  inspect(): ContactExperience {
    const count = Math.max(1, this.samples);
    const score = this.feedback < this.samples * 0.75 ? 0
      : (this.bilateral + 0.5 * this.longest + 0.03 * this.single - 0.01 * this.effort) / count;
    return { parameters: [...this.parameters], samples: this.samples, bilateralTicks: this.bilateral,
      longestBilateralTicks: this.longest, singleTicks: this.single, feedbackTicks: this.feedback, retries:this.retries, effort: this.effort, score };
  }
}

/** Finite empirical search; every score comes from ContactSkillRuntime, never external success truth. */
export class ContactExperienceSearch {
  private readonly experiences: ContactExperience[] = [];
  private readonly totals = new Map<string, {score: number; count: number}>();
  constructor(readonly candidates: readonly (readonly number[])[], readonly initial: readonly number[]) {}
  record(experience: ContactExperience): void {
    const key = JSON.stringify(experience.parameters);
    if (!this.candidates.some(p => JSON.stringify(p) === key) || !Number.isFinite(experience.score)) return;
    if (experience.samples >= 60) {
      const total = this.totals.get(key) ?? {score:0,count:0};
      this.totals.set(key,{score:total.score+experience.score,count:total.count+1});
    }
    this.experiences.push({ ...experience, parameters: [...experience.parameters] });
    if (this.experiences.length > 128) this.experiences.shift();
  }
  best(): readonly number[] {
    const grouped = this.candidates.map(parameters => {
      const total = this.totals.get(JSON.stringify(parameters));
      return { parameters, score: total ? total.score/total.count : -Infinity };
    });
    grouped.sort((a,b) => b.score-a.score);
    const initial = grouped.find(g => JSON.stringify(g.parameters) === JSON.stringify(this.initial));
    return [...(initial && Number.isFinite(initial.score) && grouped[0]?.score > Math.max(0, initial.score)
      ? grouped[0].parameters : this.initial)];
  }
  inspectScores() { return this.candidates.map(parameters=>{const total=this.totals.get(JSON.stringify(parameters));return {parameters:[...parameters],samples:total?.count??0,meanScore:total?total.score/total.count:0};}); }
  inspect(): readonly ContactExperience[] { return this.experiences.map(e => ({ ...e, parameters: [...e.parameters] })); }
}
