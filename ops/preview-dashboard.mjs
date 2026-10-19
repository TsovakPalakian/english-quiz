// Local visual preview only: synthetic data, no production credentials or writes.
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('rollback/production-assets');
const role=process.env.PREVIEW_ROLE||'DEVELOPER';
if(!['DEVELOPER','ADMIN','USER','GUEST'].includes(role))throw new Error('Invalid PREVIEW_ROLE');
const teachers=[{id:'b'.repeat(32),login:'teacher1',name:'Preview teacher 1',role:'ADMIN',active:1},{id:'e'.repeat(32),login:'teacher2',name:'Preview teacher 2',role:'ADMIN',active:1}];
const students=[{id:'c'.repeat(32),login:'student1',name:'Preview student 1',role:'USER',active:1},{id:'d'.repeat(32),login:'student2',name:'Preview student 2',role:'USER',active:1}];
const user=role==='GUEST'?null:role==='ADMIN'?teachers[0]:role==='USER'?students[0]:{id:'a'.repeat(32),login:'preview',name:'Preview',role};
const api={
  '/api/database-context':{provider:'d1',revision:3,scope:'site'},
  '/api/me':{user},'/api/me/account':{user},
  '/api/me/state':{bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:1},stageActivity:{}},
  '/api/me/themes':{theme:'light',themes:[],revision:0,customRevision:0},
  '/api/groups':{groups:[{id:41,title:'A1 Preview group',date:'2026-10-19',revision:1,studentCount:2,lessonIds:[31],examIds:[]}]},
  '/api/admin/users':{users:[...new Map([user,...teachers,...students].filter(Boolean).map(account=>[account.id,account])).values()]},
  '/api/groups/members':{members:students.map(student=>({accountId:student.id,groupId:41}))},
  '/api/accounts/group-teachers':{assignments:[{groupId:41,teacherIds:teachers.map(teacher=>teacher.id)}]},
  '/api/lessons':{materials:[{id:31,stageRevision:1,title:'Vocabulary and conversation',date:'2026-10-19',published:true,blocks:[]}]},
  '/api/exams':{exams:[]},'/api/exams/work':{work:[]},
  '/api/messages':{rooms:[],groups:[],contacts:[],unread:{},total:0},
};
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.ttf':'font/ttf'};
const server=createServer((request,response)=>{
  const path=new URL(request.url,'http://localhost').pathname;
  if(request.method!=='GET'){response.writeHead(405);response.end('Read-only preview');return;}
  if(path.startsWith('/api/')){
    response.setHeader('Content-Type','application/json');
    if(!user&&!['/api/me','/api/me/account','/api/me/themes','/api/database-context'].includes(path)){
      response.writeHead(401);response.end(JSON.stringify({error:'Sign in required.'}));return;
    }
    response.end(JSON.stringify(api[path]||(path.includes('/catalogs/')?{documents:{},cards:[],next:null}:{})));return;
  }
  const file=resolve(root,path==='/'?'index.html':'.'+path);
  if(!file.startsWith(root+'/')||path.startsWith('/private-')||!existsSync(file)||!statSync(file).isFile()){
    response.writeHead(404);response.end();return;
  }
  response.setHeader('Content-Type',types[file.slice(file.lastIndexOf('.'))]||'application/octet-stream');
  response.end(readFileSync(file));
});
server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log('Read-only visual preview: http://127.0.0.1:'+server.address().port));
