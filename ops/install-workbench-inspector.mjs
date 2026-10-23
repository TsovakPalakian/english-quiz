import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const host='ubuntu@92.5.115.171',domain='inspector.92-5-115-171.sslip.io';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function inspectorCaddyfile(original){
  if(typeof original!=='string'||!original.trim()||original.includes(domain))throw Error('Expected an unmodified original proxy configuration.');
  return original+'\n\n'+domain+' {\n  log {\n    output discard\n  }\n  header {\n    Cache-Control "no-store"\n    X-Content-Type-Options "nosniff"\n  }\n  handle /inspect {\n    request_body {\n      max_size 20MB\n    }\n    reverse_proxy 127.0.0.1:8088 {\n      transport http {\n        response_header_timeout 10s\n      }\n    }\n  }\n  handle {\n    respond 404\n  }\n}\n';
}
export function installInspector(){
  const directory='.local-secrets/workbench-infrastructure',remote='/home/ubuntu/lumiscia-workbench-inspector';
  mkdirSync(directory,{recursive:true,mode:0o700});
  const ssh=(command,input)=>execFileSync('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',host,command],{input,timeout:600000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});
  // Keep the full configuration private, including on command failure.
  const original=ssh('sudo cat /etc/caddy/Caddyfile');
  const backup=directory+'/Caddyfile.before';
  if(existsSync(backup)&&digest(readFileSync(backup))!==digest(original))throw Error('Proxy configuration changed since the private backup.');
  if(!existsSync(backup))writeFileSync(backup,original,{mode:0o600,flag:'wx'});
  const candidate=inspectorCaddyfile(original.toString('utf8'));
  writeFileSync(directory+'/Caddyfile.candidate',candidate,{mode:0o600});
  const tokenFile=directory+'/inspector-token';
  const token=existsSync(tokenFile)?readFileSync(tokenFile,'utf8').trim():randomBytes(32).toString('base64url');
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw Error('Invalid private inspector credential.');
  if(!existsSync(tokenFile))writeFileSync(tokenFile,token+'\n',{flag:'wx',mode:0o600});
  ssh('mkdir -p -m 700 '+remote);
  for(const [local,name] of [['ops/workbench-inspector/Dockerfile','Dockerfile'],['ops/workbench-inspector/server.mjs','server.mjs'],[directory+'/Caddyfile.candidate','Caddyfile.candidate']])
    execFileSync('scp',['-q','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',local,host+':'+remote+'/'+name],{timeout:30000,stdio:'pipe'});
  ssh('docker build -t lumiscia-workbench-inspector:20261023 '+remote);
  ssh('sudo caddy validate --adapter caddyfile --config '+remote+'/Caddyfile.candidate');
  const current=ssh('sudo sha256sum /etc/caddy/Caddyfile').toString().split(/\s/)[0];
  if(current!==digest(original))throw Error('Concurrent proxy configuration change; installation stopped.');
  if(ssh('docker ps -a --filter name=^lumiscia-workbench-inspector$ --format "{{.Names}}"').toString().trim())throw Error('Inspector container already exists; refusing replacement.');
  ssh('docker run -d --name lumiscia-workbench-inspector --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --memory 512m --cpus 1 --pids-limit 48 --cap-drop ALL --security-opt no-new-privileges --log-driver none -p 127.0.0.1:8088:8000 --env-file /dev/stdin lumiscia-workbench-inspector:20261023','INSPECTOR_TOKEN='+token+'\n');
  try{
    ssh('sudo cp -p /etc/caddy/Caddyfile '+remote+'/Caddyfile.rollback');
    ssh('sudo cp '+remote+'/Caddyfile.candidate /etc/caddy/Caddyfile');
    ssh('sudo systemctl reload caddy');
  }catch{
    ssh('sudo cp -p '+remote+'/Caddyfile.rollback /etc/caddy/Caddyfile');
    ssh('sudo systemctl reload caddy');
    throw Error('Proxy reload failed; previous configuration restored.');
  }
  const proof={endpoint:'https://'+domain+'/inspect',installedAt:new Date().toISOString(),originalProxySha256:digest(original),existingAnalyzerRoutePreserved:true,productionPublished:false,httpsVerified:false};
  writeFileSync(directory+'/inspector-install.json',JSON.stringify(proof,null,2)+'\n',{mode:0o600});
  return proof;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv[2]!=='--run')throw Error('Explicit --run required.');
  try{console.log(JSON.stringify(installInspector()));}catch{console.error('Inspector installation stopped; private command output was suppressed.');process.exitCode=1;}
}
