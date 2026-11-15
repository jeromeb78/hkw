const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.message));
await p.goto('file://'+require('path').join(__dirname,'..','index.html')+'');await p.click('[data-act="demo-unlock"]');
for(let ti=0;ti<4;ti++)for(let m=0;m<10;m++){
 const r=await p.evaluate(([ti,m])=>{const S=window.__hkw.S;S.view='lesson';S.lesson=[ti,m];window.__hkw.render();const h=document.querySelector('h1');return {t:h&&h.textContent,parts:document.querySelectorAll('section.card').length,q:document.querySelectorAll('[data-lq]').length,tip:!!document.querySelector('.tipcard')}},[ti,m]);
 console.log(ti,m,r.t,'| parts',r.parts,'| opts',r.q,'| tip',r.tip);}
console.log('errors',e);await b.close()})();
