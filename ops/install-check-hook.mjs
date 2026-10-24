import {spawnSync} from 'node:child_process';
import {chmodSync,existsSync} from 'node:fs';
const git=(...args)=>{
  const result=spawnSync('git',args,{encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('Git command failed: '+args.join(' '));
  return result.stdout.trim();
};
try{
  const current=spawnSync('git',['config','--get','core.hooksPath'],{encoding:'utf8'}).stdout?.trim();
  if(current&&current!=='.githooks')throw Error('An existing hooksPath is configured. Integrate the post-commit hook manually; nothing was overwritten.');
  if(!current&&existsSync(git('rev-parse','--git-path','hooks/post-commit')))throw Error('An existing post-commit hook was found. Integrate it manually; nothing was overwritten.');
  chmodSync('.githooks/post-commit',0o755);
  git('config','--local','core.hooksPath','.githooks');
  console.log('Installed repository post-commit checks. No tests, commits or deployments were run.');
}catch(error){console.error(error.message);process.exitCode=1;}
