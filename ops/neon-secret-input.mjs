export async function readNeonSecret(){
  if(!process.stdin.isTTY){let value='';for await(const chunk of process.stdin)value+=chunk;return value.trim();}
  process.stdout.write('Neon URL (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const done=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const read=chunk=>{for(const char of chunk.toString()){if(char==='\u0003'){done();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){done();resolve(value.trim());return;}if(char==='\u007f')value=value.slice(0,-1);else value+=char;}};process.stdin.on('data',read);
  });
}
