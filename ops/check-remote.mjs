import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args.length>1||args[0]?.startsWith('-')){console.error('Usage: npm run check:remote -- [remote-branch-or-tag]');process.exit(2);}
const branch=spawnSync('git',['symbolic-ref','--short','HEAD'],{encoding:'utf8'});
const ref=args[0]||branch.stdout?.trim();
if(!ref){console.error('Specify a branch or tag already pushed to GitHub.');process.exit(2);}
console.log('Dispatching tests only for remote ref '+ref+'. Local changes and unpushed commits are not uploaded.');
const result=spawnSync('gh',['workflow','run','ci-cd.yml','--ref',ref],{stdio:'inherit'});
if(result.error){console.error('GitHub CLI is required. Install gh and run gh auth login.');process.exit(1);}
process.exit(result.status??1);
