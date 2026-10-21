'use strict';
const $ = id => document.getElementById(id);
const state = {key:null, notes:[], media:new Map(), urls:new Set(), session:0, unlockAttempt:0, unlocking:false, currentId:null, ascending:false, calendar:'', lastActive:Date.now(), filter:{q:'',tag:'',topic:'',month:'',day:'',images:false}};
function node(tag, text, cls) { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(cls) el.className=cls; return el; }
function button(text, cls, action) {const el=node('button',text,cls);el.type='button';el.addEventListener('click',action);return el;}
function monthLabel(value) {return `${value.slice(0,4)} 年 ${Number(value.slice(5,7))} 月`;}
function dateLabel(note) {return note.date.replace(/^(\d{4})-(\d{2})-(\d{2}).*/,(_,y,m,d)=>`${y} 年 ${Number(m)} 月 ${Number(d)} 日`);}
function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function resetFilters() {state.filter={q:'',tag:'',topic:'',month:'',day:'',images:false};$('search').value='';render();}

async function unlock(event) {
  event.preventDefault();
  if(state.unlocking)return;
  const password=$('password').value;
  const attempt=++state.unlockAttempt,session=state.session;
  const isCurrent=()=>attempt===state.unlockAttempt&&session===state.session;
  state.unlocking=true;
  const submit=$('unlock-submit');submit.disabled=true;submit.textContent='正在打开…';
  $('unlock-message').classList.remove('error');$('unlock-message').textContent='正在解锁这本随记…';
  try {
    if(!window.crypto?.subtle) throw new Error('此浏览器需要通过 HTTPS 打开网页。');
    const responses=await Promise.all([fetch('journal.enc.json',{cache:'no-store'}),fetch('view-password-wrap.json',{cache:'no-store'})]);
    if(!isCurrent())throw new Error('解锁已取消');
    if(responses.some(response=>!response.ok))throw new Error('暂时无法读取随记资料，请刷新网页后重试。');
    const [data,passwordWrap]=await Promise.all(responses.map(response=>response.json()));
    if(!isCurrent())throw new Error('解锁已取消');
    if(!window.JournalPasswordCrypto)throw new Error('网页解锁组件未加载，请刷新网页后重试。');
    const {key,payload}=await window.JournalPasswordCrypto.decryptJournal(password,data,passwordWrap,{isCurrent});
    if(!isCurrent())throw new Error('解锁已取消');
    state.key=key;state.notes=payload.notes;state.session++;state.lastActive=Date.now();
    state.calendar=state.notes.length?state.notes.map(n=>n.date.slice(0,7)).sort().at(-1):new Date().toISOString().slice(0,7);
    $('password').value='';$('password').type='password';$('show-password').textContent='显示';
    $('unlock-message').textContent='内容与附件均已加密，仅在当前浏览器解锁。';
    $('lock-screen').hidden=true;$('journal').hidden=false;
    $('updated-at').textContent=payload.built_at?`页面更新于 ${payload.built_at.slice(0,16).replace('T',' ')}（北京时间）`:'';
    populate();resetFilters();
    if(location.hash.startsWith('#card-')) openNote(location.hash.slice(1));
    window.scrollTo(0,0);
  } catch(error) {if(attempt===state.unlockAttempt){$('unlock-message').textContent=error.message||'打开失败，请重试。';$('unlock-message').classList.add('error');}}
  finally {if(attempt===state.unlockAttempt){state.unlocking=false;$('password').value='';submit.disabled=false;submit.replaceChildren(document.createTextNode('打开我的随记 '),node('span','↗'));}}
}

function lockJournal() {
  state.unlockAttempt++;state.unlocking=false;$('unlock-submit').disabled=false;$('unlock-submit').replaceChildren(document.createTextNode('打开我的随记 '),node('span','↗'));
  state.session++;state.key=null;state.notes=[];state.currentId=null;state.media.clear();
  state.urls.forEach(url=>URL.revokeObjectURL(url));state.urls.clear();
  ['reader','lightbox'].forEach(id=>$(id).close());
  ['timeline','month-nav','topic-nav','filter-tags','calendar-grid','reader-body','reader-attachments','reader-tags'].forEach(id=>$(id).replaceChildren());
  ['reader-title','reader-id','reader-date','updated-at','start-date','calendar-title','visible-count','footer-count'].forEach(id=>$(id).textContent='');
  ['total-count','day-count','nav-count'].forEach(id=>$(id).textContent='0');
  $('lightbox-image').removeAttribute('src');$('search').value='';$('password').value='';$('journal').hidden=true;$('lock-screen').hidden=false;$('toast').hidden=true;
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);
  window.scrollTo(0,0);$('password').focus();
}

function populate() {
  $('nav-count').textContent=state.notes.length;$('total-count').textContent=state.notes.length;
  $('day-count').textContent=new Set(state.notes.map(n=>n.date.slice(0,10))).size;
  const dates=state.notes.map(n=>n.date.slice(0,10)).sort();
  $('start-date').textContent=dates.length?`始于 ${dates[0].replaceAll('-','.')}`:'等待第一条随记';
  $('footer-count').textContent=`${state.notes.length} 个被留住的瞬间`;
  const months=[...new Set(state.notes.map(n=>n.date.slice(0,7)))].sort().reverse();
  $('month-nav').replaceChildren(...months.map(month=>{const el=button(monthLabel(month),'month-button',()=>{state.filter.month=state.filter.month===month?'':month;state.filter.day='';state.calendar=month;render();});el.dataset.month=month;el.append(node('span',state.notes.filter(n=>n.date.startsWith(month)).length));return el;}));
  if(!$('mobile-month')) {
    const select=node('select',undefined,'mobile-month');select.id='mobile-month';select.setAttribute('aria-label','按月份筛选随记');
    select.addEventListener('change',()=>{state.filter.month=select.value;state.filter.day='';render();});
    $('sort-button').before(select);
    const revisit=button('偶遇旧念头 ↗','mobile-revisit',randomNote);revisit.id='mobile-revisit';document.querySelector('.hero-meta').after(revisit);
  }
  const allMonth=node('option','全部月份');allMonth.value='';
  $('mobile-month').replaceChildren(allMonth,...months.map(month=>{const option=node('option',`${month.slice(0,4)}.${month.slice(5,7)}`);option.value=month;return option;}));
  const topics=[...new Set(state.notes.flatMap(n=>n.topics))];
  $('topic-nav').replaceChildren(...topics.map(topic=>{const el=button(topic,'topic-button',()=>{state.filter.topic=state.filter.topic===topic?'':topic;render();});el.dataset.topic=topic;return el;}));
  const tags=[...new Set(state.notes.flatMap(n=>n.tags))].filter(t=>!t.startsWith('topic/')).slice(0,12);
  const all=button('全部','filter-chip',()=>{state.filter.tag='';state.filter.topic='';render();});all.dataset.tag='';
  $('filter-tags').replaceChildren(all,...tags.map(tag=>{const el=button(tag,'filter-chip',()=>{state.filter.tag=state.filter.tag===tag?'':tag;render();});el.dataset.tag=tag;return el;}));
  $('random-note').disabled=!state.notes.length;$('revisit-button').disabled=!state.notes.length;
}

function filteredNotes() {
  const f=state.filter;const q=f.q.trim().toLocaleLowerCase();
  return state.notes.filter(n=>(!q||[n.title,n.body,...n.tags,...n.topics].join('\n').toLocaleLowerCase().includes(q))&&(!f.tag||n.tags.includes(f.tag))&&(!f.topic||n.topics.includes(f.topic))&&(!f.month||n.date.startsWith(f.month))&&(!f.day||n.date.startsWith(f.day))&&(!f.images||n.attachments.some(a=>a.mime.startsWith('image/')))).sort((a,b)=>(state.ascending?1:-1)*(a.date.localeCompare(b.date)||a.id.localeCompare(b.id)));
}

function render() {
  const notes=filteredNotes();$('timeline').replaceChildren();
  let previous='';
  for(const note of notes) {
    const month=note.date.slice(0,7);
    if(month!==previous){$('timeline').append(node('h3',monthLabel(month),'month-heading'));previous=month;}
    $('timeline').append(renderCard(note));
  }
  $('visible-count').textContent=`${notes.length} 篇`;$('empty-state').hidden=notes.length>0;$('timeline-end').hidden=notes.length===0;
  const f=state.filter;
  const labels=[f.month&&monthLabel(f.month),f.day&&`${Number(f.day.slice(8,10))} 日`,f.topic&&`主题：${f.topic}`,f.tag&&`#${f.tag}`,f.q&&`搜索：${f.q}`].filter(Boolean);
  $('active-filter').hidden=!labels.length;$('active-filter').firstElementChild.textContent=labels.join(' · ');
  document.querySelectorAll('.month-button').forEach(el=>el.classList.toggle('active',el.dataset.month===f.month));
  document.querySelectorAll('.topic-button').forEach(el=>el.classList.toggle('active',el.dataset.topic===f.topic));
  document.querySelectorAll('.filter-chip').forEach(el=>el.classList.toggle('active',el.dataset.tag===f.tag));
  $('image-filter').setAttribute('aria-pressed',String(f.images));
  $('mobile-month').value=f.month;
  $('sort-button').textContent=state.ascending?'最早在前 ↑':'最新在前 ↓';renderCalendar();
}

function renderCard(note) {
  const entry=node('article',undefined,'timeline-entry');entry.id=note.anchor;
  const stamp=node('div',undefined,'date-stamp');const time=node('time');time.dateTime=note.date;
  time.append(node('strong',note.date.slice(8,10)),node('small',note.weekday));stamp.append(time);
  const card=node('div',undefined,'entry-card');
  const main=node('div',undefined,'card-main');const meta=node('div',undefined,'entry-meta');
  const source=node('span');source.append(node('i',undefined,'meta-dot'),document.createTextNode(note.tags.find(t=>!t.startsWith('topic/'))||note.topics[0]||'随想'));
  meta.append(source,node('span',note.id));
  const title=node('h3');title.append(button(note.title,'card-title',()=>openNote(note.anchor)));main.append(meta,title);
  if(note.quote) main.append(node('blockquote',note.quote,'card-quote'));
  if(note.thought) main.append(node('p',note.thought,'card-excerpt'));
  card.append(main);
  const image=note.attachments.find(a=>a.mime.startsWith('image/'));
  if(image) {
    const imageButton=button('', 'card-picture',()=>showImage(image));imageButton.setAttribute('aria-label',`查看「${note.title}」的配图`);
    const img=node('img');img.alt=`${note.title}的原始配图`;img.loading='lazy';imageButton.append(img);card.append(imageButton);
    loadMedia(image).then(url=>{if(img.isConnected&&state.key)img.src=url;}).catch(()=>{if(state.key){imageButton.replaceChildren(node('div','配图暂时未能加载，点开全文后可重试。','image-loading'));}});
  }
  const bottom=node('div',undefined,'card-bottom');const tags=node('div',undefined,'card-tags');
  note.tags.filter(t=>!t.startsWith('topic/')).slice(0,3).forEach(tag=>tags.append(button('# '+tag,'card-tag',()=>{state.filter.tag=tag;render();})));
  if(!tags.childNodes.length)tags.append(node('span',note.topics[0]||'随想','card-tag'));
  bottom.append(tags,button('阅读全文 ↗','read-more',()=>openNote(note.anchor)));card.append(bottom);entry.append(stamp,card);return entry;
}

function renderCalendar() {
  const [year,month]=state.calendar.split('-').map(Number);$('calendar-title').textContent=monthLabel(state.calendar);
  const first=(new Date(year,month-1,1).getDay()+6)%7;const days=new Date(year,month,0).getDate();
  const grid=[];for(let i=0;i<first;i++)grid.push(node('span'));
  for(let day=1;day<=days;day++) {
    const date=`${state.calendar}-${String(day).padStart(2,'0')}`;const has=state.notes.some(n=>n.date.startsWith(date));
    if(has){const el=button(String(day),'has-note',()=>{state.filter.month=state.calendar;state.filter.day=state.filter.day===date?'':date;render();});el.setAttribute('aria-label',`${year}年${month}月${day}日，有随记`);el.classList.toggle('selected',state.filter.day===date);grid.push(el);}
    else grid.push(node('span',day));
  }
  $('calendar-grid').replaceChildren(...grid);
  const months=state.notes.map(n=>n.date.slice(0,7)).sort();
  $('calendar-prev').disabled=!months.length||state.calendar<=months[0];$('calendar-next').disabled=!months.length||state.calendar>=months.at(-1);
}
function moveCalendar(delta) {const [y,m]=state.calendar.split('-').map(Number);const date=new Date(y,m-1+delta,1);state.calendar=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;renderCalendar();}

async function loadMedia(attachment) {
  if(state.media.has(attachment.file))return state.media.get(attachment.file);
  const session=state.session;const key=state.key;
  const pending=(async()=>{const response=await fetch(attachment.file);if(!response.ok)throw new Error('附件读取失败');const data=new Uint8Array(await response.arrayBuffer());
    if(session!==state.session||!key)throw new Error('随记已锁定');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:new TextEncoder().encode(attachment.aad)},key,data.slice(12));
    if(session!==state.session)throw new Error('随记已锁定');
    const url=URL.createObjectURL(new Blob([plain],{type:attachment.mime}));state.urls.add(url);return url;})();
  state.media.set(attachment.file,pending);pending.catch(()=>state.media.delete(attachment.file));return pending;
}

async function showImage(attachment) {try {const url=await loadMedia(attachment);if(!state.key)return;$('lightbox-image').src=url;$('lightbox-image').alt=attachment.name;$('lightbox').showModal();}catch {if(state.key)toast('图片暂时无法打开，请稍后重试。');}}

function inline(text, target) {
  const pattern=/(`[^`]+`|\*\*[^*]+\*\*|!?\[\[[^\]]+\]\]|\[[^\]]+\]\([^\s)]+\))/g;
  let start=0;for(const match of text.matchAll(pattern)) {
    target.append(document.createTextNode(text.slice(start,match.index)));const value=match[0];
    if(value.startsWith('`'))target.append(node('code',value.slice(1,-1)));
    else if(value.startsWith('**'))target.append(node('strong',value.slice(2,-2)));
    else if(value.includes('[[')){const inside=value.replace(/^!?\[\[|\]\]$/g,'');const [path,label]=inside.split('|');target.append(document.createTextNode(label||path.split('/').at(-1).replace(/\.[^.]+$/,'')));}
    else{const parts=value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(parts&&/^https?:\/\//i.test(parts[2])){const a=node('a',parts[1]);a.href=parts[2];a.target='_blank';a.rel='noreferrer noopener';target.append(a);}else target.append(document.createTextNode(value));}
    start=match.index+value.length;
  }target.append(document.createTextNode(text.slice(start)));
}

function markdown(text) {
  const root=node('div');const lines=text.split(/\r?\n/);let i=0;
  while(i<lines.length) {
    let line=lines[i];if(!line.trim()||line.trim()==='---'){i++;continue;}
    if(line.startsWith('```')){const pre=node('pre'),code=node('code');const block=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i++]);code.textContent=block.join('\n');pre.append(code);root.append(pre);i++;continue;}
    if(/^#{1,3} /.test(line)){const marks=line.match(/^(#+) /)[1].length;const heading=node(marks===1?'h2':`h${marks}`);inline(line.slice(marks+1),heading);root.append(heading);i++;continue;}
    if(/^\s*>/.test(line)){const block=node('blockquote');while(i<lines.length&&/^\s*>/.test(lines[i])){const p=node('p');inline(lines[i++].replace(/^\s*>\s?/,''),p);block.append(p);}root.append(block);continue;}
    if(/^\s*[-*] /.test(line)){const list=node('ul');while(i<lines.length&&/^\s*[-*] /.test(lines[i])){const item=node('li');inline(lines[i++].replace(/^\s*[-*] /,''),item);list.append(item);}root.append(list);continue;}
    const p=node('p');const block=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,3} |>|[-*] |```)/.test(lines[i]))block.push(lines[i++]);inline(block.join('\n'),p);root.append(p);
  }return root;
}

function openNote(anchor) {
  const note=state.notes.find(n=>n.anchor===anchor);if(!note)return;state.currentId=anchor;
  $('reader-date').textContent=dateLabel(note);$('reader-id').textContent=note.id;$('reader-title').textContent=note.title;
  $('reader-tags').replaceChildren(...note.tags.filter(t=>!t.startsWith('topic/')).map(t=>node('span','# '+t)));
  $('reader-body').replaceChildren(markdown(note.body));$('reader-attachments').replaceChildren();
  for(const attachment of note.attachments) {
    const figure=node('figure');figure.append(node('figcaption',attachment.name));$('reader-attachments').append(figure);
    loadMedia(attachment).then(url=>{if(state.currentId!==anchor||!figure.isConnected||!state.key)return;
      if(attachment.mime.startsWith('image/')){const img=node('img');img.src=url;img.alt=attachment.name;img.addEventListener('click',()=>showImage(attachment));figure.prepend(img);}
      else if(/^(audio|video)\//.test(attachment.mime)){const media=node(attachment.mime.split('/')[0]);media.src=url;media.controls=true;media.preload='metadata';figure.prepend(media);}
      else{const link=node('a','下载附件 ↓','attachment-download');link.href=url;link.download=attachment.name;figure.prepend(link);}
    }).catch(()=>{if(figure.isConnected&&state.key)figure.prepend(node('p','附件暂时无法加载。'));});
  }
  if(!$('reader').open)$('reader').showModal();$('reader').scrollTop=0;
  history.replaceState(null,'',`#${anchor}`);
}
function randomNote() {if(state.notes.length)openNote(state.notes[Math.floor(Math.random()*state.notes.length)].anchor);}
function downloadNote(){const note=state.notes.find(n=>n.anchor===state.currentId);if(!note)return;const url=URL.createObjectURL(new Blob([note.raw],{type:'text/markdown;charset=utf-8'}));const a=node('a');a.href=url;a.download=`${note.id}-${note.title.replace(/[<>:"/\\|?*]/g,'-')}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('unlock-form').addEventListener('submit',unlock);
$('show-password').addEventListener('click',()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').textContent=show?'隐藏':'显示';$('show-password').setAttribute('aria-label',show?'隐藏密码':'显示密码');});
['lock-button','mobile-lock'].forEach(id=>$(id).addEventListener('click',lockJournal));
['all-notes','clear-filter','empty-reset'].forEach(id=>$(id).addEventListener('click',resetFilters));
['random-note','revisit-button'].forEach(id=>$(id).addEventListener('click',randomNote));
$('sort-button').addEventListener('click',()=>{state.ascending=!state.ascending;render();});
$('image-filter').addEventListener('click',()=>{state.filter.images=!state.filter.images;render();});
$('search').addEventListener('input',()=>{state.filter.q=$('search').value;render();});
$('calendar-prev').addEventListener('click',()=>moveCalendar(-1));$('calendar-next').addEventListener('click',()=>moveCalendar(1));
$('close-reader').addEventListener('click',()=>$('reader').close());$('close-lightbox').addEventListener('click',()=>$('lightbox').close());
$('reader').addEventListener('close',()=>{state.currentId=null;$('reader-body').replaceChildren();$('reader-attachments').replaceChildren();if(location.hash)history.replaceState(null,'',location.pathname+location.search);});
['reader','lightbox'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id))$(id).close();}));
$('download-note').addEventListener('click',downloadNote);
document.addEventListener('keydown',e=>{state.lastActive=Date.now();if(e.key==='/'&&state.key&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('reader').open){e.preventDefault();$('search').focus();}});
['pointerdown','scroll','touchstart'].forEach(event=>document.addEventListener(event,()=>state.lastActive=Date.now(),{passive:true}));
setInterval(()=>{if(state.key&&Date.now()-state.lastActive>30*60*1000){lockJournal();$('unlock-message').textContent='离开已有一会儿，随记已自动锁定。';}},60000);
