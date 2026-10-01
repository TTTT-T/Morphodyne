import {expect,it} from 'vitest';
import {runContactTrial} from './ContactLearningTrial';
it('excludes empty, self closure, wall and ground contact from learned success',async()=>{
 for(const kind of ['machine','body','free-body'] as const)for(const negative of [true,'self','wall','ground'] as const){
  const params=kind==='machine'?[.15,.4]:[.075,.25];
  const r=await runContactTrial(kind,{x:0,y:0,z:0},params,negative);
  console.info('NEGATIVE',kind,negative,JSON.stringify(r));
  expect(r.longestBilateralTicks).toBe(0);expect(r.experience.longestBilateralTicks).toBeLessThan(30);
 }
},15000);
