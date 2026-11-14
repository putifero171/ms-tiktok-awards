(() => {
 const fallback=window.AWARD_CATEGORIES||[];
 let categories=[],active=0,selected={category:"",nominee:"",categoryId:null,nomineeId:null},voteCounts={},sb=null;
 const $=id=>document.getElementById(id);
 const tabs=$('category-tabs'),grid=$('nominee-grid'),title=$('active-title'),count=$('nominee-count'),search=$('search'),empty=$('empty-state'),visible=$('visible-count');
 const modal=$('vote-modal'),qty=$('vote-quantity'),method=$('payment-method'),amount=$('vote-amount'),ref=$('vote-reference'),recipient=$('payment-recipient'),copy=$('copy-reference');
 const bulkOffer=$('bulk-offer'),bulkSave=$('bulk-savings');
 function priceFor(quantity,euros){const regular=euros?quantity:quantity*1000;return quantity===10?(euros?8:8000):regular;}
 const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
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
  const grouped=new Map();(people.data||[]).forEach(n=>{if(!grouped.has(n.category_id))grouped.set(n.category_id,[]);grouped.get(n.category_id).push(n)});
  categories=(cats.data||[]).map(c=>({...c,nominees:grouped.get(c.id)||[]}));voteCounts={};
  if(!votes.error)(votes.data||[]).forEach(v=>voteCounts[v.nominee_id]=Number(v.vote_count)||0);
  if(!categories.length)fallbackData();
 }
 let rankingRefreshInFlight=false;
 async function refreshApprovedRanking(){
  if(!sb||rankingRefreshInFlight||document.visibilityState==='hidden')return;
  rankingRefreshInFlight=true;
  try{
   const {data,error}=await sb.from('approved_vote_totals').select('nominee_id,vote_count');
   if(error)throw error;
   const latest={};
   (data||[]).forEach(v=>latest[v.nominee_id]=Number(v.vote_count)||0);
   voteCounts=latest;
   render();
   const status=document.querySelector('.ranking-status');
   if(status)status.textContent='AO VIVO';
  }catch(error){console.warn('Ranking refresh failed:',error)}
  finally{rankingRefreshInFlight=false}
 }
 function imageUrl(path){return path&&sb?sb.storage.from('nominee-images').getPublicUrl(path).data.publicUrl:''}
 function openVote(category,person){selected={category:category.title,nominee:person.name,categoryId:category.id,nomineeId:person.id};$('vote-nominee').textContent=person.name;$('vote-category').textContent=category.title;qty.value=1;$('voter-email').value='';$('payer-name').value='';$('transaction-reference').value='';$('payment-proof').value='';$('vote-submit-status').textContent='';$('submit-vote').disabled=!sb||!person.id;updatePayment();modal.hidden=false;document.body.classList.add('modal-open')}
 window.__awardsOpenVote=openVote;window.__awardsUpdatePayment=updatePayment;window.__awardsAppReady=true;
 function closeVote(){modal.hidden=true;document.body.classList.remove('modal-open')}
 function updatePayment(){
  const n=Math.max(1,Math.min(1000,parseInt(qty.value,10)||1));qty.value=n;
  const selectedMethod=String(method.value||'paypal').trim().toLowerCase();
  const paypal=selectedMethod==='paypal';
  const revolut=selectedMethod==='revolut';
  const mbway=selectedMethod==='mbway';
  const euroPayment=paypal||revolut||mbway;
  const reference='Voto X '+(selected.category||'Categoria')+' X '+(selected.nominee||'Nome')+' X '+n+' votos';
  const total=priceFor(n,euroPayment),discounted=n===10;
  amount.innerHTML=discounted?'<span class="price-was">'+(euroPayment?'€10':'10.000 Kz')+'</span> '+(euroPayment?'€8':'8.000 Kz'):(euroPayment?'€'+total.toLocaleString('pt-PT'):total.toLocaleString('pt-PT')+' Kz');
  if(bulkOffer){bulkOffer.classList.toggle('is-selected',discounted);bulkOffer.setAttribute('aria-pressed',String(discounted));}
  if(bulkSave)bulkSave.textContent=discounted?'Poupa '+(euroPayment?'€2':'2.000 Kz')+' nesta compra':'Poupa 20% ao escolher 10 votos';
  ref.textContent=reference;
  recipient.innerHTML=mbway?'MB WAY: <b>926 372 367</b>':revolut?'Revolut: <b>revolut.me/fidaliag</b>':paypal?'PayPal: <b>Marcelolemossmith@gmail.com</b>':'Multicaixa Express: <b>941 232 417</b><br>Titular: <b>Marcelo Smith</b>';
  const express=$('express-instructions'),launch=$('payment-launch'),hint=$('payment-step-hint');
  express.hidden=paypal||revolut||mbway;express.style.display=(paypal||revolut||mbway)?'none':'block';
  launch.href=revolut?'https://revolut.me/fidaliag':paypal?'https://www.paypal.com/':'#';launch.textContent=revolut?'ABRIR REVOLUT PARA PAGAR ↗':paypal?'ABRIR PAYPAL PARA PAGAR ↗':'PAGAR POR MB WAY';launch.hidden=!(paypal||revolut);launch.style.display=(paypal||revolut)?'inline-block':'none';
  const proofFields=document.querySelector('.vote-submit-fields');
  if(proofFields)proofFields.hidden=false;
  const manualEuroFields=revolut||mbway;
  $('payer-name-field').hidden=!manualEuroFields;$('voter-email-field').hidden=manualEuroFields;
  document.querySelector('label[for="transaction-reference"]').hidden=manualEuroFields;$('transaction-reference').hidden=manualEuroFields;
  $('payer-name').required=manualEuroFields;$('voter-email').required=!manualEuroFields;
  $('transaction-reference').required=!manualEuroFields;$('payment-proof').required=true;
  const modalWarning=document.querySelector('.modal-warning');
  if(modalWarning)modalWarning.textContent='Submete apenas depois de concluíres o pagamento. A submissão fica pendente e só será contabilizada após verificação manual.';
  $('submit-vote').textContent='ENVIAR VOTO E COMPROVATIVO';
  if(hint)hint.textContent=mbway?'Abre a aplicação MB WAY, envia o valor exacto para o número 926 372 367 e regressa para indicar o nome do pagador e anexar o comprovativo. Usa a descrição do voto apresentada no site.':revolut?'Abre o Revolut pelo botão acima, envia o valor exacto e regressa para indicar o teu nome e anexar a captura do pagamento. Usa a descrição do voto apresentada no site.':paypal?'Conclui o pagamento na tua conta PayPal para Marcelolemossmith@gmail.com. Depois regressa aqui, indica o ID da transacção e anexa o comprovativo.':'Conclui a transferência na aplicação Multicaixa Express para o número acima. Depois regressa aqui, indica a referência da transacção e anexa o comprovativo.';
 }

 function renderOverallTop3(){
  const container=$('overall-top-grid');if(!container)return;
  const all=[];
  categories.forEach(category=>category.nominees.forEach((person,index)=>{
   if(!person.id)return;
   all.push({person,category,votes:Number(voteCounts[person.id])||0,index});
  }));
  all.sort((a,b)=>b.votes-a.votes||a.person.name.localeCompare(b.person.name,'pt'));
  const top=all.slice(0,3);
  if(!top.length){container.innerHTML='<p class="overall-top-empty">O ranking geral ficará disponível quando os primeiros votos forem aprovados.</p>';return}
  container.innerHTML='';
  top.forEach((entry,index)=>{
   const card=document.createElement('article');card.className='overall-top-card overall-top-rank-'+(index+1);
   const rank=document.createElement('span');rank.className='overall-top-rank';rank.textContent='#'+(index+1);
   const photoUrl=imageUrl(entry.person.image_path);
   if(photoUrl){const img=document.createElement('img');img.className='overall-top-photo';img.src=photoUrl;img.alt='Fotografia de '+entry.person.name;img.loading='lazy';img.onerror=()=>img.remove();card.appendChild(img)}
   const details=document.createElement('div');details.className='overall-top-details';
   const name=document.createElement('h3');name.textContent=entry.person.name;
   const category=document.createElement('p');category.className='overall-top-category';category.textContent=entry.category.title;
   const votes=document.createElement('strong');votes.className='overall-top-votes';votes.textContent=entry.votes.toLocaleString('pt-PT')+' votos';
   details.append(name,category,votes);card.prepend(rank);card.appendChild(details);container.appendChild(card);
  });
 }
 function renderTabs(){tabs.innerHTML='';categories.forEach((c,i)=>{const b=document.createElement('button');b.className='category-tab'+(i===active?' active':'');b.innerHTML='<span class="tab-no">'+String(i+1).padStart(2,'0')+'</span>'+c.title;b.addEventListener('click',()=>{active=i;render()});tabs.appendChild(b)})}
 function render(){
  if(!categories.length){title.textContent='Sem nomeados disponíveis';grid.innerHTML='';count.textContent='0 NOMEADOS';empty.hidden=false;return}
  active=Math.min(active,categories.length-1);const q=slug(search.value.trim()),cat=categories[active];title.textContent=cat.title;
  const items=cat.nominees.map((person,i)=>({person,i,votes:voteCounts[person.id]||0})).filter(x=>!q||slug(x.person.name).includes(q)||slug(cat.title).includes(q));
  items.sort((a,b)=>b.votes-a.votes||a.i-b.i);grid.innerHTML='';
  items.forEach((x,pos)=>{const p=x.person,card=document.createElement('article');card.className='nominee-card ranking-card';const no=document.createElement('div');no.className='nominee-index';no.textContent='#'+String(pos+1).padStart(2,'0');const star=document.createElement('span');star.className='nominee-star';star.textContent='✦';const url=imageUrl(p.image_path);if(url){const img=document.createElement('img');img.className='nominee-photo';img.src=url;img.alt='Fotografia de '+p.name;img.loading='lazy';img.onerror=()=>img.remove();card.appendChild(img)}const name=document.createElement('div');name.className='nominee-name';name.textContent=p.name;const votes=document.createElement('div');votes.className='nominee-votes';votes.innerHTML='<strong>'+x.votes.toLocaleString('pt-PT')+'</strong><span>VOTOS</span>';const vote=document.createElement('button');vote.className='nominee-vote-button';vote.type='button';vote.textContent='VOTAR';vote.addEventListener('click',()=>openVote(cat,p));card.append(no,star,name,votes,vote);grid.appendChild(card)});
  count.textContent=items.length+' NOMEADOS';empty.hidden=items.length!==0;visible.textContent=String(categories.length).padStart(2,'0');renderTabs();const total=Object.values(voteCounts).reduce((a,b)=>a+b,0);const el=$('total-votes');if(el)el.textContent=total.toLocaleString('pt-PT');renderOverallTop3();
 }
 async function submitVote(){
  const button=$('submit-vote'),status=$('vote-submit-status'),file=$('payment-proof').files[0],email=$('voter-email').value.trim(),payerName=$('payer-name').value.trim(),transaction=$('transaction-reference').value.trim();
  const quantity=Math.max(1,Math.min(1000,parseInt(qty.value,10)||1)),paypal=method.value==='paypal',revolut=method.value==='revolut',mbway=method.value==='mbway',manualEuro=revolut||mbway,total=priceFor(quantity,paypal||manualEuro);
  if(!sb||!selected.nomineeId){status.textContent='Não foi possível ligar à votação. Actualiza a página e tenta novamente.';return}
  if(manualEuro){if(!payerName){status.textContent='Introduz o nome de quem fez o pagamento.';return}}else if(!email||!$('voter-email').checkValidity()){status.textContent='Introduz um email válido.';return}
  const submittedTransaction=manualEuro?ref.textContent:transaction;
  if(!submittedTransaction){status.textContent='Indica a referência da transacção.';return}
  if(!file){status.textContent='Anexa o comprovativo de pagamento.';return}
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
  if(!allowed.includes(file.type)){status.textContent='Formato não suportado. Usa JPG, PNG, WEBP ou PDF.';return}
  if(file.size>10*1024*1024){status.textContent='O ficheiro excede o limite de 10 MB.';return}
  button.disabled=true;status.textContent='A enviar comprovativo e registo...';
  let proofPath=null;
  try{
   const ext=file.name.split('.').pop().toLowerCase(),unique=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
   proofPath=selected.nomineeId+'/'+unique+'.'+ext;
   const uploaded=await sb.storage.from('payment-proofs').upload(proofPath,file,{upsert:false,contentType:file.type});
   if(uploaded.error)throw new Error('Falha no envio do comprovativo para o armazenamento: '+uploaded.error.message);
   const payload={category_id:selected.categoryId,nominee_id:selected.nomineeId,quantity,payment_method:mbway?'mbway':revolut?'revolut':paypal?'paypal':'multicaixa_express',currency:(paypal||manualEuro)?'EUR':'AOA',amount:total,payment_reference:ref.textContent,transaction_reference:submittedTransaction,voter_email:email||null,payer_name:manualEuro?payerName:null,proof_path:proofPath,status:'pending'};
   const saved=await sb.from('vote_submissions').insert(payload);
   if(saved.error){await sb.storage.from('payment-proofs').remove([proofPath]);throw new Error('O ficheiro foi enviado, mas a base de dados recusou a submissão: '+saved.error.message);}
   status.textContent='Submissão recebida! O teu voto está pendente de validação do pagamento. Ainda não foi contado.';
   button.textContent='SUBMISSÃO RECEBIDA';
   setTimeout(()=>{closeVote();button.disabled=false;button.textContent='ENVIAR VOTO E COMPROVATIVO'},3500);
  }catch(error){console.error('Vote submission failed',error);status.textContent='Não foi possível registar. '+(error.message||'Tenta novamente ou contacta a organização.');button.disabled=false}
 }
 search.addEventListener('input',render);document.querySelector('.menu-toggle').addEventListener('click',()=>document.querySelector('.topbar').classList.toggle('nav-open'));$('close-vote').addEventListener('click',closeVote);$('cancel-vote').addEventListener('click',closeVote);modal.addEventListener('click',e=>{if(e.target===modal)closeVote()});qty.addEventListener('input',updatePayment);qty.addEventListener('change',updatePayment);if(bulkOffer)bulkOffer.addEventListener('click',()=>{qty.value=10;updatePayment()});method.addEventListener('input',updatePayment);method.addEventListener('change',updatePayment);method.addEventListener('click',updatePayment);$('submit-vote').addEventListener('click',submitVote);
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(ref.textContent);copy.textContent='COPIADO!';setTimeout(()=>copy.textContent='COPIAR REFERÊNCIA',1800)}catch{copy.textContent='SELECCIONA E COPIA A REFERÊNCIA'}});
 fallbackData();render();
 loadLiveData().then(()=>render()).catch(e=>{console.error('Live Supabase data unavailable; keeping nominee list visible.',e);render()});
 window.setInterval(refreshApprovedRanking,10000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshApprovedRanking()});
 const paymentResult=new URLSearchParams(window.location.search).get('payment');
 if(paymentResult==='success'){
  const banner=document.createElement('div');banner.textContent='Pagamento iniciado com sucesso. Os votos só serão adicionados após validação do pagamento pela organização.';
  banner.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:100000;padding:16px 20px;border:1px solid #42d9cf;border-radius:12px;background:#101a25;color:#fff;font:600 14px/1.5 sans-serif;box-shadow:0 8px 30px #0008';document.body.appendChild(banner);
  window.history.replaceState({},'',window.location.pathname+window.location.hash);
 }
})();