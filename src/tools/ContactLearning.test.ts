import {expect,it} from 'vitest';
import {
 CONTACT_INITIAL_PARAMETERS,CONTACT_TEST_OFFSETS,contactTestDisturbances,
 runContactTrial,trainContactSkill,trainDisturbedContact,
} from './ContactLearningTrial';
import {runContactArenaExperiment} from './ContactArenaExperiment';
const mean=(values:readonly number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const success=(row:Awaited<ReturnType<typeof runContactTrial>>)=>row.longestBilateralTicks>=30;
const recovered=(row:Awaited<ReturnType<typeof runContactTrial>>)=>row.postLongestBilateralTicks>=30&&row.recoveryTicks>=0&&row.recoveryTicks<=60;
it('learns the same sensor contact mechanism on a non-Agent mechanical chain',async()=>{
 const learned=await trainContactSkill('machine');
 const baseline=[],trained=[];
 for(const offset of CONTACT_TEST_OFFSETS){baseline.push(await runContactTrial('machine',offset,CONTACT_INITIAL_PARAMETERS));trained.push(await runContactTrial('machine',offset,learned.parameters));}
 console.info('MECHANICAL LEARNING',JSON.stringify({parameters:learned.parameters,baseline,trained}));
 expect(trained.filter(success).length/trained.length).toBeGreaterThanOrEqual(.75);
 expect((trained.filter(success).length-baseline.filter(success).length)/trained.length).toBeGreaterThanOrEqual(.25);
 expect(mean(trained.map(r=>r.longestBilateralTicks))).toBeGreaterThanOrEqual(mean(baseline.map(r=>r.longestBilateralTicks)));
},15000);
it('preserves original body limitations and separates the front morphology gain',async()=>{
 const original=[],front=[];
 for(const offset of CONTACT_TEST_OFFSETS){original.push(await runContactTrial('body',offset,CONTACT_INITIAL_PARAMETERS));front.push(await runContactTrial('extended-body',offset,CONTACT_INITIAL_PARAMETERS));}
 console.info('STATIC MORPHOLOGY COMPARISON',JSON.stringify({original,front}));
 expect(original.filter(success)).toHaveLength(4);expect(front.filter(success)).toHaveLength(8);
 // This is a structural gain, and does not satisfy the original static learning increment.
},15000);
it('meets separately frozen curriculum v2 recovery gates and measures actual full-body transfer',async()=>{
 const trained=await trainDisturbedContact();
 const initial=trained.candidateScores.find(c=>c.parameters.length===2)!;
 const selected=trained.candidateScores.find(c=>JSON.stringify(c.parameters)===JSON.stringify(trained.parameters))!;
 expect(selected.samples).toBe(12);expect(selected.meanScore).toBeGreaterThanOrEqual(initial.meanScore);
 const baseline=[],rows=[];
 for(const offset of CONTACT_TEST_OFFSETS)for(const disturbance of contactTestDisturbances(offset)){
  baseline.push({offset,disturbance,...await runContactTrial('extended-body',offset,CONTACT_INITIAL_PARAMETERS,false,disturbance)});
  rows.push({offset,disturbance,...await runContactTrial('extended-body',offset,trained.parameters,false,disturbance)});
 }
 console.info('CURRICULUM V2 ACCEPTANCE',JSON.stringify({parameters:trained.parameters,candidates:trained.candidateScores.length,totalTrainingEpisodes:trained.candidateScores.reduce((s,c)=>s+c.samples,0),initial,selected,baseline,rows}));
 expect(rows.filter(recovered).length/rows.length).toBeGreaterThanOrEqual(.75);
 expect((rows.filter(recovered).length-baseline.filter(recovered).length)/rows.length).toBeGreaterThanOrEqual(.25);
 expect(mean(rows.map(r=>r.postLongestBilateralTicks))).toBeGreaterThanOrEqual(mean(baseline.map(r=>r.postLongestBilateralTicks)));
 for(const negative of [true,'self','wall','ground'] as const){
  const result=await runContactTrial('extended-body',{x:0,y:0,z:0},trained.parameters,negative);
  console.info('LEARNED NEGATIVE',negative,JSON.stringify(result));
  expect(result.longestBilateralTicks).toBe(0);expect(result.experience.longestBilateralTicks).toBeLessThan(30);
 }
 const fullBody=[];
 for(const offset of CONTACT_TEST_OFFSETS){
  const disturbance=contactTestDisturbances(offset)[0];
  fullBody.push({offset,fixed:await runContactTrial('extended-free-body',offset,CONTACT_INITIAL_PARAMETERS,false,disturbance),learned:await runContactTrial('extended-free-body',offset,trained.parameters,false,disturbance)});
 }
 console.info('FULL BODY TRANSFER',JSON.stringify(fullBody));
 const accepted=await runContactArenaExperiment();
 const fixed=await runContactArenaExperiment(CONTACT_INITIAL_PARAMETERS,true);
 const learned=await runContactArenaExperiment(trained.parameters,true);
 console.info('ARENA TRANSFER',JSON.stringify({accepted,fixed,learned}));
 // Integration evidence proves the selected experience was consumed, without inventing a combat gate.
 for(const agent of learned.damages)expect(agent.contactExperience?.parameters).toEqual(trained.parameters);
 expect(learned.energyJ.every(Number.isFinite)).toBe(true);
},120000);
