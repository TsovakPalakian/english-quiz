export function databaseMedia(bucket,prefix){
  if(!bucket)return bucket;
  if(!/^[a-z]+\/(?:neon|d1)\/$/.test(prefix))throw Error('Invalid database media namespace');
  return new Proxy(bucket,{get(target,key){
    if(key==='put')return (path,value,options)=>target.put(prefix+path,value,
      /^"[^"\r\n]+"$/.test(options?.onlyIf?.etagMatches||'')?{...options,onlyIf:{...options.onlyIf,etagMatches:options.onlyIf.etagMatches.slice(1,-1)}}:options);
    if(['get','head','delete'].includes(key))return (path,...args)=>target[key](Array.isArray(path)?path.map(value=>prefix+value):prefix+path,...args);
    if(key==='list')return async(options={})=>{const value=await target.list({...options,prefix:prefix+(options.prefix||'')});return {...value,objects:value.objects.map(object=>({...object,key:object.key.slice(prefix.length)})),...(value.delimitedPrefixes?{delimitedPrefixes:value.delimitedPrefixes.map(path=>path.slice(prefix.length))}:{})};};
    if(['createMultipartUpload','resumeMultipartUpload'].includes(key))return ()=>{throw Error('Multipart uploads require an explicit database namespace adapter');};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
