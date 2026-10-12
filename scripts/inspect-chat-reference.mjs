import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/tsovakpalakian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const page=await browser.newPage({viewport:{width:1664,height:1000}});
  await page.route('**/*',route=>route.abort());
  const reports=[];
  for(const suffix of ['', '_1','_2']){
    const base='/Users/tsovakpalakian/Downloads/Web А-Чат'+suffix;
    const html=readFileSync(base+'.html','utf8'),css=readFileSync(base+'_files/app.2bde5d645e817d9d912f.css','utf8');
    const clean=await page.evaluate(html=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      doc.querySelectorAll('script,iframe,link,base').forEach(node=>node.remove());
      doc.querySelectorAll('*').forEach(node=>{for(const a of [...node.attributes])if(a.name.startsWith('on'))node.removeAttribute(a.name);});
      return doc.documentElement.outerHTML;
    },html);
    await page.setContent(clean);await page.addStyleTag({content:css});
    const report=await page.evaluate(()=>{
      const containers=[...document.querySelectorAll('div,aside,main,nav,textarea')].filter(node=>{const r=node.getBoundingClientRect();return r.width>200&&r.height>400;}).slice(0,35).map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {tag:node.tagName,class:node.className,width:r.width,height:r.height,x:r.x,font:s.fontFamily,size:s.fontSize,bg:s.backgroundColor};});
      const backgrounds=[...document.querySelectorAll('*')].map(node=>({class:node.className,image:getComputedStyle(node).backgroundImage})).filter(row=>row.image!=='none'&&typeof row.class==='string');
      const inputs=[...document.querySelectorAll('input,textarea')].map(node=>({class:node.className,placeholder:node.getAttribute('placeholder')}));
      return {containers,inputs,backgrounds};
    });
    reports.push({file:suffix||'main',...report});
  }
  writeFileSync('/private/tmp/chat-reference-layout.json',JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports.map(({file,containers,inputs,backgrounds})=>({file,containers,inputs,backgrounds:backgrounds.map(({class:c,image})=>({class:c,image:image.slice(0,100),length:image.length}))})),null,2));
}finally{await browser.close();}
