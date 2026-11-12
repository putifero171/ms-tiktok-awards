(() => {
 const fallback=window.AWARD_CATEGORIES||[];
 let categories=[],active=0,selected={category:"",nominee:""},voteCounts={};
 const tabs=document.getElementById('category-tabs'),grid=document.getElementById('nominee-grid'),title=document.getElementById('active-title'),count=document.getElementById('nominee-count'),search=document.getElementById('search'),empty=document.getElementById('empty-state'),visible=document.getElementById('visible-count');
 const modal=document.getElementById('vote-modal'),qty=document.getElementById('vote-quantity'),method=document.getElementById('payment-method'),amount=document.getElementById('vote-amount'),ref=document.getElementById('vote-reference'),recipient=document.getElementById('payment-recipient'),copy=document.getElementById('copy-reference');
 const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let sb=null;
 try{if(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_PUBLISHABLE_KEY)sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY)}catch(e){console.error(e)}
 function fallbackData(){categories=fallback.map((c,i)=>({id:null,title:c.title,nominees:c.nominees.map((name,j)=>({id:null,name,image_path:null,display_order:j+1}))}));voteCounts={}}
 async function loadLiveData(){
  if(!sb){fallbackData();return}
  const [cats,people,votes]=await Promise.all([
   sb.from('categories').select('id,title,display_order').eq('is_active',true).order('display_order'),
   sb.from('nominees').select('id,name,category_id,image_path,display_order').eq('is_active',true).order('display_order'),
   sb.from('approved_vote_totals').select('nominee_id,vote_count')
  ]);
  if(cats.error||people.error){console.error('Supabase public data error:',cats.error||people.error);fallbackData();return}
  const grouped=new Map();
  (people.data||[]).forEach(n=>{if(!grouped.has(n.category_id))grouped.set(n.category_id,[]);grouped.get(n.category_id).push(n)});
  categories=(cats.data||[]).map(c=>({...c,nominees:grouped.get(c.id)||[]}));
  voteCounts={};if(!votes.error)(votes.data||[]).forEach(v=>voteCounts[v.nominee_id]=Number(v.vote_count)||0);
  if(!categories.length)fallbackData();
 }
 function imageUrl(path){return path&&sb?sb.storage.from('nominee-images').getPublicUrl(path).data.publicUrl:''}
 function openVote(category,nominee){selected={category,nominee};document.getElementById('vote-nominee').textContent=nominee;document.getElementById('vote-category').textContent=category;qty.value=1;updatePayment();modal.hidden=false;document.body.classList.add('modal-open')}
 function closeVote(){modal.hidden=true;document.body.classList.remove('modal-open')}
 function updatePayment(){const n=Math.max(1,Math.min(1000,parseInt(qty.value,10)||1));qty.value=n;const paypal=method.value==='paypal';amount.textContent=paypal?'€'+n.toLocaleString('pt-PT'):(n*1000).toLocaleString('pt-PT')+' Kz';ref.textContent='Voto X '+selected.category+' X '+selected.nominee+' X '+n+' votos';document.getElementById('paypal-pay').hidden=!paypal;document.getElementById('express-instructions').hidden=paypal;recipient.innerHTML=paypal?'PayPal: <b>Marcelolemossmith@gmail.com</b>':'Multicaixa Express: <b>941 232 417</b><br>Titular: <b>Marcelo Smith</b>'}
 function renderTabs(){tabs.innerHTML='';categories.forEach((c,i)=>{const b=document.createElement('button');b.className='category-tab'+(i===active?' active':'');b.innerHTML='<span class="tab-no">'+String(i+1).padStart(2,'0')+'</span>'+c.title;b.addEventListener('click',()=>{active=i;render()});tabs.appendChild(b)})}
 function render(){
  if(!categories.length){title.textContent='Sem nomeados disponíveis';grid.innerHTML='';count.textContent='0 NOMEADOS';empty.hidden=false;return}
  active=Math.min(active,categories.length-1);const q=slug(search.value.trim()),cat=categories[active];title.textContent=cat.title;
  const items=cat.nominees.map((person,i)=>({person,i,votes:voteCounts[person.id]||0})).filter(x=>!q||slug(x.person.name).includes(q)||slug(cat.title).includes(q));
  items.sort((a,b)=>b.votes-a.votes||a.i-b.i);grid.innerHTML='';
  items.forEach((x,pos)=>{const p=x.person,card=document.createElement('article');card.className='nominee-card ranking-card';const no=document.createElement('div');no.className='nominee-index';no.textContent='#'+String(pos+1).padStart(2,'0');const star=document.createElement('span');star.className='nominee-star';star.textContent='✦';const url=imageUrl(p.image_path);if(url){const img=document.createElement('img');img.className='nominee-photo';img.src=url;img.alt='Fotografia de '+p.name;img.loading='lazy';img.onerror=()=>img.remove();card.appendChild(img)}const name=document.createElement('div');name.className='nominee-name';name.textContent=p.name;const votes=document.createElement('div');votes.className='nominee-votes';votes.innerHTML='<strong>'+x.votes.toLocaleString('pt-PT')+'</strong><span>VOTOS</span>';const vote=document.createElement('button');vote.className='nominee-vote-button';vote.type='button';vote.textContent='VOTAR';vote.addEventListener('click',()=>openVote(cat.title,p.name));card.append(no,star,name,votes,vote);grid.appendChild(card)});
  count.textContent=items.length+' NOMEADOS';empty.hidden=items.length!==0;visible.textContent=String(categories.length).padStart(2,'0');renderTabs();const total=Object.values(voteCounts).reduce((a,b)=>a+b,0);const el=document.getElementById('total-votes');if(el)el.textContent=total.toLocaleString('pt-PT');
 }
 search.addEventListener('input',render);document.querySelector('.menu-toggle').addEventListener('click',()=>document.querySelector('.topbar').classList.toggle('nav-open'));document.getElementById('close-vote').addEventListener('click',closeVote);document.getElementById('cancel-vote').addEventListener('click',closeVote);modal.addEventListener('click',e=>{if(e.target===modal)closeVote()});qty.addEventListener('input',updatePayment);method.addEventListener('change',updatePayment);
 document.getElementById('paypal-pay').addEventListener('click',()=>{const n=Math.max(1,Math.min(1000,parseInt(qty.value,10)||1));const params=new URLSearchParams({cmd:'_xclick',business:'Marcelolemossmith@gmail.com',item_name:'MS TikTok PALOP Awards vote - '+selected.category+' - '+selected.nominee,item_number:ref.textContent,amount:String(n.toFixed(2)),currency_code:'EUR',no_note:'0'});window.open('https://www.paypal.com/cgi-bin/webscr?'+params.toString(),'_blank','noopener')});
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(ref.textContent);copy.textContent='COPIADO!';setTimeout(()=>copy.textContent='COPIAR REFERÊNCIA',1800)}catch{copy.textContent='SELECCIONA E COPIA A REFERÊNCIA'}});
 loadLiveData().then(render).catch(e=>{console.error(e);fallbackData();render()});
})();