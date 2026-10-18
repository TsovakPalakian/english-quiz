import {readNeonSecret} from './neon-secret-input.mjs';
import {neonProductionReadiness} from '../src/database-readiness.mjs';

try{
  if(process.argv.length!==2)throw new Error('Run without arguments; the connection is read from hidden stdin.');
  const status=await neonProductionReadiness({NEON_DATABASE_URL:await readNeonSecret()});
  console.log(JSON.stringify(status,null,2));
  if(!status.ready)process.exitCode=2;
}catch(error){
  console.error(error.status?error.message:'Database cutover check failed. No database was changed.');
  process.exitCode=1;
}
