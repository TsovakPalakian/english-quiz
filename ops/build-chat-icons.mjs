// Build production/chat-icons.js with only icons referenced by the site and chat.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const full=resolve(root,'production/chat-icons.full.js');
const out=resolve(root,'production/chat-icons.js');

function pascal(kebab){
  return kebab.split('-').map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join('');
}

function collectNames(){
  const names=new Set(['circle-minus','circle-plus','mic','video','square']);
  const scan=(text)=>{
    for(const match of text.matchAll(/data-(?:lucide|chat-icon)="([a-z0-9-]+)"/g))names.add(match[1]);
    for(const match of text.matchAll(/\bicon\(([^)]*)\)/g))
      for(const name of match[1].matchAll(/['"]([a-z0-9-]+)['"]/g))names.add(name[1]);
  };
  for(const dir of ['production/chat','production','client','client/main','site']){
    const path=resolve(root,dir);
    for(const name of readdirSync(path,{withFileTypes:true})){
      if(!name.isFile())continue;
      if(!/\.(js|html)$/.test(name.name))continue;
      if(name.name==='chat-icons.js'||name.name==='chat-icons.full.js'||name.name==='chat.js')continue;
      scan(readFileSync(resolve(path,name.name),'utf8'));
    }
  }
  return [...names].sort();
}

export function buildChatIcons(){
  const names=collectNames();
  const sandbox={globalThis:{},self:undefined,window:undefined};
  sandbox.globalThis=sandbox;sandbox.self=sandbox;sandbox.window=sandbox;
  const context=createContext(sandbox);
  runInContext(readFileSync(full,'utf8'),context,{timeout:10000});
  const lucide=sandbox.lucide;
  if(!lucide?.icons||!lucide.createIcons)throw new Error('chat-icons.full.js did not expose lucide');
  const missing=[],picked={};
  for(const name of names){
    const key=pascal(name);
    const icon=lucide.icons[key];
    if(!icon){missing.push(name);continue;}
    picked[key]=icon;
  }
  if(missing.length)throw new Error('Missing Lucide icons: '+missing.join(', '));
  const payload=JSON.stringify(picked);
  const source=`/**
 * Trimmed Lucide icons for english-quiz (from chat-icons.full.js).
 * Rebuild: node ops/build-chat-icons.mjs
 */
(function(root,icons){
  'use strict';
  function node(tag,attrs,children){
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attrs||{}))el.setAttribute(key,String(value));
    for(const child of children||[])el.appendChild(createElement(child));
    return el;
  }
  function createElement(icon){
    if(!icon)return null;
    if(Array.isArray(icon[0]))return icon.map(createElement);
    return node(icon[0],icon[1],icon[2]);
  }
  function toPascal(name){
    return String(name||'').split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join('');
  }
  function createIcons(options){
    const nameAttr=options?.nameAttr||'data-lucide';
    const host=options?.root||document;
    host.querySelectorAll('['+nameAttr+']').forEach(el=>{
      const name=el.getAttribute(nameAttr);
      const icon=icons[toPascal(name)];
      if(!icon)return;
      const svg=createElement(icon);
      if(!svg)return;
      svg.setAttribute('class',['lucide','lucide-'+name,el.getAttribute('class')||''].filter(Boolean).join(' ').trim());
      for(const attr of el.attributes)if(!['class',nameAttr].includes(attr.name))svg.setAttribute(attr.name,attr.value);
      svg.setAttribute(nameAttr,name);
      el.replaceWith(svg);
    });
  }
  const api={icons,createIcons,createElement};
  for(const [key,value] of Object.entries(icons))api[key]=value;
  root.lucide=api;
})(typeof globalThis!=='undefined'?globalThis:window,${payload});
`;
  writeFileSync(out,source);
  return {count:Object.keys(picked).length,names,bytes:source.length};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const result=buildChatIcons();
  console.log(JSON.stringify({status:'chat-icons-built',icons:result.count,bytes:result.bytes}));
}
