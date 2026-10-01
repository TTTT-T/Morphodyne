import {expect,it} from 'vitest';
import {readContactTraining,saveContactTraining} from './ContactExperienceTransfer';
it('round trips measured candidate counts and rejects old or invalid saved experience',()=>{
 const data=new Map<string,string>();
 const storage:Storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},get length(){return data.size;},clear:()=>data.clear(),removeItem:key=>{data.delete(key);},key:index=>[...data.keys()][index]??null};
 const replace=(value:unknown)=>storage.setItem(storage.key(0)!,JSON.stringify(value));
 expect(readContactTraining(storage)).toBeUndefined();
 const artifact=saveContactTraining(storage,{parameters:[.25,.55,1,.15,12,4,.003],candidateScores:[{parameters:[.25,.3],samples:12,meanScore:.9},{parameters:[.25,.55,1,.15,12,4,.003],samples:12,meanScore:1.1}]});
 expect(readContactTraining(storage)).toEqual(artifact);expect(artifact.searchEpisodes).toBe(24);
 replace({...artifact,searchEpisodes:undefined});expect(readContactTraining(storage)).toBeUndefined();
 replace({...artifact,parameters:[.25,.55,0]});expect(readContactTraining(storage)).toBeUndefined();
 replace({...artifact,searchCandidates:2.5});expect(readContactTraining(storage)).toBeUndefined();
});
