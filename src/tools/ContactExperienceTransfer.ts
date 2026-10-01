/** Tab-session experiment artifact; parameters come from measured training, never a preset winner. */
const KEY='morphodyne.contact-training.v2';
export interface ContactTrainingArtifact {
  readonly version:2;
  readonly parameters:readonly number[];
  readonly trainingEpisodes:number;
  readonly sensorMeanScore:number;
  readonly searchCandidates:number;
  readonly searchEpisodes:number;
  readonly frontContact:true;
}
export function saveContactTraining(storage:Storage,result:{readonly parameters:readonly number[];readonly candidateScores:readonly {parameters:readonly number[];samples:number;meanScore:number}[]}):ContactTrainingArtifact {
 const selected=result.candidateScores.find(c=>JSON.stringify(c.parameters)===JSON.stringify(result.parameters));
 if(!selected || selected.samples!==12)throw new Error('Expected measured curriculum v2 experience');
 const artifact:ContactTrainingArtifact={version:2,parameters:[...result.parameters],trainingEpisodes:selected.samples,sensorMeanScore:selected.meanScore,searchCandidates:result.candidateScores.length,searchEpisodes:result.candidateScores.reduce((n,c)=>n+c.samples,0),frontContact:true};
 storage.setItem(KEY,JSON.stringify(artifact));return artifact;
}
export function readContactTraining(storage:Storage):ContactTrainingArtifact|undefined {
 const text=storage.getItem(KEY);if(!text)return undefined;
 try{
  const value=JSON.parse(text) as ContactTrainingArtifact;
  if(value.version!==2 || value.frontContact!==true || value.trainingEpisodes!==12 || !Number.isFinite(value.sensorMeanScore) || !Array.isArray(value.parameters) || value.parameters.length<2 || value.parameters.length>7 || value.parameters.some(p=>!Number.isFinite(p)) || (value.parameters[2]!==undefined && (value.parameters[2]<=0 || value.parameters[2]>10)) || !Number.isSafeInteger(value.searchCandidates) || value.searchCandidates<1 || value.searchCandidates>256 || !Number.isSafeInteger(value.searchEpisodes) || value.searchEpisodes!==value.searchCandidates*value.trainingEpisodes)return undefined;
  return {...value,parameters:[...value.parameters]};
 }catch{return undefined;}
}
