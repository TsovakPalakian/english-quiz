importScripts('/fflate-0.8.2.js');
self.onmessage=event=>{
  try{
    const entries=Object.create(null);
    for(const file of event.data){if(!file.path||file.path.startsWith('/')||file.path.split('/').includes('..'))throw Error('Invalid folder path.');entries[file.path]=file.bytes;}
    const archive=fflate.zipSync(entries,{level:1});
    if(archive.length>25*1024*1024)throw Error('Maximum archive size is 25 MB.');
    self.postMessage({archive},[archive.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
