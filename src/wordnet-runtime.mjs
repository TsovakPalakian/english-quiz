import {StudyError} from './learning-study.mjs';
import {openWordNetDataset} from './wordnet-dataset.mjs';

export const WORDNET_DIGEST='82f8078fd81d47a850940ce60a8c4d4314ed5eef0e5432448ae8ee515c86d02a';
const datasets=new WeakMap();

export async function configuredWordNet(env){
  if(env.LEARNING_WORDNET_ENABLED!=='true')return null;
  const binding=env.WORDNET_DB;
  if(!binding||typeof binding.prepare!=='function'||[env.DB,env.STUDY_DB].includes(binding))throw new StudyError(503,'A separate WordNet D1 database is required.');
  let pending=datasets.get(binding);
  if(!pending){
    pending=openWordNetDataset({expectedDigest:WORDNET_DIGEST,db:{async read(sql,args=[]){
      const statement=binding.prepare(sql);
      const result=await (args.length?statement.bind(...args):statement).all();
      if(!result?.success||!Array.isArray(result.results))throw new StudyError(503,'WordNet database is unavailable.');
      return result.results;
    }}});
    datasets.set(binding,pending);
  }
  try{return {enabled:true,dataset:await pending};}
  catch(error){if(datasets.get(binding)===pending)datasets.delete(binding);throw error;}
}
