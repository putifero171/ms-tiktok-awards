(() => {
 const fallback=window.AWARD_CATEGORIES||[];
 let categories=[],categorySponsors={},active=0,currentUser=null,selected={category:"",nominee:"",categoryId:null,nomineeId:null},voteCounts={},sb=null;
 const $=id=>document.getElementById(id);
 const tabs=$('category-tabs'),grid=$('nominee-grid'),title=$('active-title'),count=$('nominee-count'),search=$('search'),empty=$('empty-state'),visible=$('visible-count');
 const modal=$('vote-modal'),qty=$('vote-quantity'),method=$('payment-method'),amount=$('vote-amount'),ref=$('vote-reference'),recipient=$('payment-recipient'),copy=$('copy-reference');
 const bulkOffer=$('bulk-offer'),bulkSave=$('bulk-savings'),blackFridayOffer=$('black-friday-offer'),bulkPicker=$('bulk-pack-picker'),bulkPackCount=$('bulk-pack-count');
 const BLACK_FRIDAY_END=new Date('2026-11-16T20:48:00+00:00').getTime();
 function blackFridayActive(){return Date.now()<BLACK_FRIDAY_END;}
 function priceFor(quantity,euros){if(quantity===100&&blackFridayActive())return euros?50:50000;const regular=euros?quantity:quantity*1000;return quantity>=10&&quantity<=50&&quantity%10===0?quantity*(euros?0.8:800):regular;}
 function updateBlackFridayTimer(){
  const banner=$('black-friday-promo'),timer=$('black-friday-timer'),offer=$('black-friday-offer');
  const remaining=BLACK_FRIDAY_END-Date.now(),active=remaining>0;
  if(banner)banner.hidden=!active;if(offer)offer.hidden=!active;
  if(!active&&modal&&!modal.hidden&&Number(qty.value)===100)updatePayment();
  if(timer&&active){const seconds=Math.floor(remaining/1000),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),secs=seconds%60;timer.textContent=String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(secs).padStart(2,'0');}
 }
 const slug=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 try{if(window.supabase&&window.SUPABASE_URL&&window.SUPABASE_PUBLISHABLE_KEY)sb=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY)}catch(e){console.error(e)}
 function fallbackData(){categories=fallback.map((c,i)=>({id:null,title:c.title,nominees:c.nominees.map((name,j)=>({id:null,name,image_path:null,display_order:j+1}))}));voteCounts={}}
 async function loadCategorySponsors(){
  if(!sb){categorySponsors={};return}
  const {data,error}=await sb.from('category_sponsors').select('category_id,sponsor_name,logo_path,website_url').eq('is_active',true);
  if(error){console.warn('Category sponsors unavailable:',error.message);categorySponsors={};return}
  categorySponsors={};(data||[]).forEach(item=>categorySponsors[item.category_id]=item);
 }
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
 async function loadCeoVideo(){
  if(!sb)return;
  const {data,error}=await sb.storage.from('ceo-message').list('',{limit:20,sortBy:{column:'updated_at',order:'desc'}});
  if(error){console.warn('CEO video unavailable:',error.message);return}
  const file=(data||[]).find(item=>item.name==='current.mp4');
  if(!file)return;
  const {data:publicFile}=sb.storage.from('ceo-message').getPublicUrl('current.mp4');
  const video=$('ceo-message-video'),placeholder=$('ceo-video-placeholder');
  if(!video||!publicFile?.publicUrl)return;
  video.src=publicFile.publicUrl+'?v='+encodeURIComponent(file.updated_at||file.created_at||Date.now());
  video.hidden=false;if(placeholder)placeholder.hidden=true;
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
 function openVote(category,person){if(Date.now()>=new Date('2026-12-27T23:59:59+00:00').getTime()){const closedStatus=$('vote-submit-status');if(closedStatus)closedStatus.textContent='A votação encerrou a 27 de Dezembro de 2026.';return}selected={category:category.title,nominee:person.name,categoryId:category.id,nomineeId:person.id};$('vote-nominee').textContent=person.name;$('vote-category').textContent=category.title;qty.value=1;$('voter-email').value='';$('payer-name').value='';$('transaction-reference').value='';$('payment-proof').value='';$('vote-submit-status').textContent='';$('submit-vote').disabled=!sb||!person.id;updatePayment();modal.hidden=false;document.body.classList.add('modal-open')}
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
  const promoDiscounted=n===100&&blackFridayActive(),total=priceFor(n,euroPayment),discounted=n>=10&&n<=50&&n%10===0,regularTotal=euroPayment?n:n*1000;
  amount.innerHTML=promoDiscounted?'<span class="price-was">'+(euroPayment?'€100':'100.000 Kz')+'</span> '+(euroPayment?'€50':'50.000 Kz'):discounted?'<span class="price-was">'+(euroPayment?'€'+regularTotal.toLocaleString('pt-PT'):regularTotal.toLocaleString('pt-PT')+' Kz')+'</span> '+(euroPayment?'€'+total.toLocaleString('pt-PT'):total.toLocaleString('pt-PT')+' Kz'):(euroPayment?'€'+total.toLocaleString('pt-PT'):total.toLocaleString('pt-PT')+' Kz');
  if(blackFridayOffer){blackFridayOffer.classList.toggle('is-selected',promoDiscounted);blackFridayOffer.setAttribute('aria-pressed',String(promoDiscounted));}
  if(bulkOffer){bulkOffer.classList.toggle('is-selected',discounted);bulkOffer.setAttribute('aria-pressed',String(discounted));}
  if(bulkSave)bulkSave.textContent=discounted?'Poupa '+(euroPayment?'€'+(regularTotal-total).toLocaleString('pt-PT'):(regularTotal-total).toLocaleString('pt-PT')+' Kz')+' nesta compra':'Poupa 20% ao escolher pacotes de 10 votos';
  if(bulkPicker)bulkPicker.hidden=!discounted;
  if(bulkPackCount&&discounted)bulkPackCount.value=String(n/10);
  if(bulkOffer){const packLabel=bulkOffer.querySelector('.bulk-offer-top b');if(packLabel)packLabel.textContent=discounted?'PACK ESPECIAL · '+(n/10)+' × 10 VOTOS':'PACK ESPECIAL · 10 VOTOS';const packPrice=bulkOffer.querySelector('.bulk-offer-price strong');if(packPrice)packPrice.textContent='€'+(n>=10&&n<=50&&n%10===0?priceFor(n,true):8).toLocaleString('pt-PT');const packCurrency=bulkOffer.querySelector('.bulk-offer-price span');if(packCurrency)packCurrency.textContent=(n>=10&&n<=50&&n%10===0?priceFor(n,false):8000).toLocaleString('pt-PT')+' Kz';}
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


 const MEMBER_BADGES=[
  {code:'first_vote',icon:'✦',name:'Primeiro Apoio',description:'Aprovado o teu primeiro voto.'},
  {code:'supporter_10',icon:'♡',name:'Fã de Carteirinha',description:'Atingiste 10 votos aprovados.'},
  {code:'fan_30',icon:'🏆',name:'Super Fã',description:'Atingiste 30 votos aprovados.'},
  {code:'champion_50',icon:'⭐',name:'Campeão',description:'Atingiste 50 votos aprovados.'},
  {code:'legend_100',icon:'👑',name:'Lenda PALOP',description:'Atingiste 100 votos aprovados.'},
  {code:'category_explorer',icon:'🌍',name:'Explorador PALOP',description:'Apoiastes nomeados em 3 categorias diferentes.'}
 ];
 function renderAccountNotifications(result){
  const root=$('account-notifications-list'),button=$('notifications-mark-read');if(!root)return;
  if(result.error){root.innerHTML='<p class="account-empty">Não foi possível carregar as notificações. Executa a migração SQL indicada pela organização.</p>';console.warn('Notifications:',result.error);if(button)button.disabled=true;return}
  const items=result.data||[],unread=items.filter(x=>!x.is_read).length;
  if(button){button.disabled=!unread;button.textContent=unread?'MARCAR TUDO COMO LIDO ('+unread+')':'TUDO LIDO';}
  root.innerHTML=items.length?items.map(item=>'<article class="account-notification '+(item.is_read?'is-read':'is-unread')+'"><span class="notification-dot"></span><div><strong>'+escapeAccountText(item.title)+'</strong><p>'+escapeAccountText(item.message)+'</p><small>'+new Date(item.created_at).toLocaleString('pt-PT',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</small></div></article>').join(''):'<p class="account-empty">Ainda não tens notificações. As tuas conquistas e recompensas aparecerão aqui.</p>';
 }
 function renderAccountBadges(result){
  const root=$('account-badges-grid');if(!root)return;
  if(result.error){root.innerHTML='<p class="account-empty">Não foi possível carregar os badges. Executa a migração SQL indicada pela organização.</p>';console.warn('Badges:',result.error);return}
  const earned=new Map((result.data||[]).map(item=>[item.badge_code,item.earned_at]));
  const count=$('account-badges-count');if(count)count.textContent=earned.size+' / '+MEMBER_BADGES.length;
  root.innerHTML=MEMBER_BADGES.map(b=>'<article class="member-badge '+(earned.has(b.code)?'is-earned':'is-locked')+'"><span class="member-badge-icon">'+b.icon+'</span><strong>'+b.name+'</strong><small>'+b.description+'</small><em>'+(earned.has(b.code)?'CONQUISTADO':'POR CONQUISTAR')+'</em></article>').join('');
 }
 async function markAccountNotificationsRead(){
  if(!currentUser)return;
  const button=$('notifications-mark-read');if(button)button.disabled=true;
  const {error}=await sb.from('awards_notifications').update({is_read:true}).eq('user_id',currentUser.id).eq('is_read',false);
  if(error){console.error('Mark notifications read:',error);if(button)button.disabled=false;return}
  const {data,error:reloadError}=await sb.from('awards_notifications').select('id,title,message,notification_type,is_read,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(30);
  if(!reloadError)renderAccountNotifications({data,error:null});
 }
 async function loadAccountHistory(){
  const history=$('account-history');if(!currentUser||!history)return;
  history.innerHTML='<p class="account-empty">A carregar os votos aprovados...</p>';
  const [historyResult,loyaltyResult,rewardsResult,redemptionResult,notificationsResult,badgesResult]=await Promise.all([
    sb.from('vote_submissions').select('id,quantity,created_at,payment_method,amount,currency,category:categories(title),nominee:nominees(name)').eq('user_id',currentUser.id).eq('status','approved').order('created_at',{ascending:false}).limit(100),
    sb.rpc('get_my_loyalty_status'),
    sb.from('awards_loyalty_rewards').select('id,milestone_votes,created_at,status').eq('user_id',currentUser.id).eq('status','available').order('milestone_votes',{ascending:true}),
    sb.from('awards_loyalty_redemptions').select('id,quantity,created_at,category:categories(title),nominee:nominees(name)').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(50),
    sb.from('awards_notifications').select('id,title,message,notification_type,is_read,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(30),
    sb.from('awards_member_badges').select('badge_code,earned_at').eq('user_id',currentUser.id).order('earned_at',{ascending:true})
  ]);

  renderAccountNotifications(notificationsResult);
  renderAccountBadges(badgesResult);
  const {data,error}=historyResult;
  if(error){history.innerHTML='<p class="account-empty">Não foi possível carregar o histórico. Tenta novamente mais tarde.</p>';console.error('Account history:',error);return}
  const rows=data||[],cats=new Set(rows.map(row=>row.category?.title).filter(Boolean));
  $('account-categories-count').textContent=String(cats.size);$('account-orders-count').textContent=String(rows.length);
  if(loyaltyResult.error){console.error('Loyalty status:',loyaltyResult.error);$('account-total-votes').textContent=rows.reduce((sum,row)=>sum+(Number(row.quantity)||0),0).toLocaleString('pt-PT');}
  else{
    const loyalty=loyaltyResult.data||{},total=Number(loyalty.approved_votes)||0,progress=Number(loyalty.progress_in_cycle)||0,remaining=30-progress;
    $('account-total-votes').textContent=total.toLocaleString('pt-PT');
    $('loyalty-progress-label').textContent=progress+' / 30 votos';
    $('loyalty-next-label').textContent=remaining===30?'Começa a acumular votos':'Faltam '+remaining+' votos';
    $('loyalty-progress-bar').style.width=(progress/30*100)+'%';
    $('loyalty-available-count').textContent=String(loyalty.available_rewards||0);
    $('loyalty-redeemed-count').textContent=String(loyalty.redeemed_rewards||0);
  }
  if(rewardsResult.error){console.error('Loyalty rewards:',rewardsResult.error)}
  const rewardHistory=$('account-loyalty-history');
  if(rewardHistory){
    if(redemptionResult.error){console.error('Loyalty redemption history:',redemptionResult.error);rewardHistory.innerHTML='<p class="account-empty">Não foi possível carregar o histórico de recompensas.</p>'}
    else if(!(redemptionResult.data||[]).length){rewardHistory.innerHTML='<p class="account-empty">Ainda não utilizaste vouchers.</p>'}
    else rewardHistory.innerHTML=redemptionResult.data.map(item=>{
      const date=new Date(item.created_at).toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'});
      return '<article class="loyalty-history-row"><div><strong>'+escapeAccountText(item.nominee?.name||'Nomeado')+'</strong><span>'+escapeAccountText(item.category?.title||'Categoria')+' · '+date+'</span></div><b>+'+Number(item.quantity)+' votos grátis</b><em>REDEEMED</em></article>';
    }).join('');
  }
  const rewards=rewardsResult.data||[],rewardSelect=$('account-loyalty-reward'),redeemButton=$('account-loyalty-redeem');
  rewardSelect.innerHTML=rewards.length?rewards.map(r=>'<option value="'+r.id+'">Voucher de 3 votos · marco '+Number(r.milestone_votes)+' votos</option>').join(''):'<option value="">Sem vouchers disponíveis</option>';
  rewardSelect.disabled=!rewards.length;
  renderAccountLoyaltyNominees();
  redeemButton.disabled=!rewards.length||!$('account-loyalty-nominee').value;
  if(!rows.length){history.innerHTML='<p class="account-empty">Ainda não tens votos aprovados associados a esta conta.</p>';return}
  history.innerHTML=rows.map(row=>{const date=new Date(row.created_at).toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'});const money=row.currency==='EUR'?'€'+Number(row.amount).toLocaleString('pt-PT'):(Number(row.amount).toLocaleString('pt-PT')+' Kz');return '<article class="account-history-row"><div class="account-history-main"><strong>'+escapeAccountText(row.nominee?.name||'Nomeado')+'</strong><span>'+escapeAccountText(row.category?.title||'Categoria')+' · '+date+'</span></div><div class="account-history-meta"><b>'+Number(row.quantity)+' votos</b><span>'+money+'</span></div></article>'}).join('');
 }
 function renderAccountLoyaltyNominees(){
  const select=$('account-loyalty-nominee');if(!select)return;
  const current=select.value,options=[];
  (categories||[]).forEach(category=>(category.nominees||[]).forEach(nominee=>{
    if(nominee.id)options.push('<option value="'+nominee.id+'" data-category="'+category.id+'">'+escapeAccountText(nominee.name)+' — '+escapeAccountText(category.title)+'</option>');
  }));
  select.innerHTML=options.length?'<option value="">Selecciona um nomeado</option>'+options.join(''):'<option value="">Não existem nomeados disponíveis</option>';
  if(current&&select.querySelector('option[value="'+current+'"]'))select.value=current;
  const button=$('account-loyalty-redeem');if(button)button.disabled=!$('account-loyalty-reward')?.value||!select.value;
 }
 async function redeemLoyaltyReward(){
  const rewardId=$('account-loyalty-reward')?.value,nomineeSelect=$('account-loyalty-nominee'),nomineeId=nomineeSelect?.value,status=$('account-loyalty-status'),button=$('account-loyalty-redeem');
  const selectedOption=nomineeSelect?.selectedOptions?.[0],categoryId=selectedOption?.dataset.category;
  if(!rewardId||!nomineeId||!categoryId||!currentUser)return;
  button.disabled=true;status.textContent='A validar o teu voucher...';
  const {data,error}=await sb.rpc('redeem_my_loyalty_reward',{p_reward_id:rewardId,p_category_id:categoryId,p_nominee_id:nomineeId});
  if(error){status.textContent='Não foi possível utilizar o voucher: '+error.message;console.error('Loyalty redemption:',error);button.disabled=false;return}
  status.textContent='Voucher utilizado! Foram atribuídos 3 votos grátis ao nomeado escolhido.';
  await loadAccountHistory();
  if(data?.success)refreshApprovedRanking().catch(()=>{});
 }
 function escapeAccountText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 async function syncAccount(session){
  currentUser=session?.user||null;
  const auth=$('account-auth'),dashboard=$('account-dashboard');if(!auth||!dashboard)return;
  auth.hidden=!!currentUser;dashboard.hidden=!currentUser;
  if(!currentUser)return;
  // Supabase has restored the OAuth session; now safely clean the token fragment and show the account section.
  window.history.replaceState({},'',window.location.pathname+'#minha-conta');
  const accountSection=$('minha-conta');if(accountSection)accountSection.scrollIntoView({behavior:'smooth',block:'start'});
  const displayName=currentUser.user_metadata?.username||currentUser.user_metadata?.full_name||currentUser.email||'Membro';
  $('account-user-email').textContent=currentUser.email||'';
  $('account-welcome').textContent='Bem-vindo, '+displayName;
  await loadAccountHistory();
 }
 async function initAccount(){
  if(!sb)return;
  const status=$('account-auth-status');
  $('account-google')?.addEventListener('click',async()=>{
   status.textContent='A ligar ao Google...';
   const {error}=await sb.auth.signInWithOAuth({
    provider:'google',
    options:{redirectTo:window.location.origin+'/',queryParams:{prompt:'select_account'}}
   });
   if(error){status.textContent='Não foi possível iniciar sessão com Google. Tenta novamente.';console.error('Google OAuth:',error);}
  });
  $('account-loyalty-redeem')?.addEventListener('click',redeemLoyaltyReward);
  $('notifications-mark-read')?.addEventListener('click',markAccountNotificationsRead);
  $('account-loyalty-reward')?.addEventListener('change',()=>{const b=$('account-loyalty-redeem');if(b)b.disabled=!$('account-loyalty-reward').value||!$('account-loyalty-nominee').value});
  $('account-loyalty-nominee')?.addEventListener('change',()=>{const b=$('account-loyalty-redeem');if(b)b.disabled=!$('account-loyalty-reward').value||!$('account-loyalty-nominee').value});
  $('account-logout')?.addEventListener('click',async()=>{
   const {error}=await sb.auth.signOut();
   if(error){status.textContent=error.message;return}
   await syncAccount(null);
  });
  sb.auth.onAuthStateChange((event,session)=>{
   window.setTimeout(async()=>{
    if(event==='SIGNED_OUT')await syncAccount(null);
    else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')await syncAccount(session);
   },0);
  });
  const {data:{session}}=await sb.auth.getSession();
  await syncAccount(session);
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

 function renderCategorySponsor(category){
  const host=$('category-sponsor-area');if(!host)return;host.innerHTML='';
  const sponsor=categorySponsors[category.id];if(!sponsor)return;
  const card=document.createElement('article');card.className='category-sponsor-card';
  const logoWrap=document.createElement('div');logoWrap.className='category-sponsor-logo';
  if(sponsor.logo_path&&sb){const image=document.createElement('img');image.src=sb.storage.from('category-sponsor-logos').getPublicUrl(sponsor.logo_path).data.publicUrl;image.alt=sponsor.sponsor_name+' logo';image.loading='lazy';logoWrap.appendChild(image)}else{logoWrap.textContent='✦'}
  const details=document.createElement('div');details.className='category-sponsor-details';
  const label=document.createElement('span');label.textContent='CATEGORIA PATROCINADA POR';
  const name=document.createElement('strong');name.textContent=sponsor.sponsor_name;details.append(label,name);
  card.append(logoWrap,details);
  if(sponsor.website_url){const link=document.createElement('a');link.href=sponsor.website_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='VISITAR ↗';card.appendChild(link)}
  host.appendChild(card);
 }
 function render(){
  if(!categories.length){title.textContent='Sem nomeados disponíveis';grid.innerHTML='';count.textContent='0 NOMEADOS';empty.hidden=false;return}
  active=Math.min(active,categories.length-1);const q=slug(search.value.trim()),cat=categories[active];title.textContent=cat.title;
  renderCategorySponsor(cat);
  const items=cat.nominees.map((person,i)=>({person,i,votes:voteCounts[person.id]||0})).filter(x=>!q||slug(x.person.name).includes(q)||slug(cat.title).includes(q));
  items.sort((a,b)=>b.votes-a.votes||a.i-b.i);grid.innerHTML='';
  items.forEach((x,pos)=>{const p=x.person,card=document.createElement('article');card.className='nominee-card ranking-card';const no=document.createElement('div');no.className='nominee-index';no.textContent='#'+String(pos+1).padStart(2,'0');const star=document.createElement('span');star.className='nominee-star';star.textContent='✦';const url=imageUrl(p.image_path);if(url){const img=document.createElement('img');img.className='nominee-photo';img.src=url;img.alt='Fotografia de '+p.name;img.loading='lazy';img.onerror=()=>img.remove();card.appendChild(img)}const name=document.createElement('div');name.className='nominee-name';name.textContent=p.name;const votes=document.createElement('div');votes.className='nominee-votes';votes.innerHTML='<strong>'+x.votes.toLocaleString('pt-PT')+'</strong><span>VOTOS</span>';const vote=document.createElement('button');vote.className='nominee-vote-button';vote.type='button';vote.textContent='VOTAR';vote.addEventListener('click',()=>openVote(cat,p));card.append(no,star,name,votes,vote);grid.appendChild(card)});
  count.textContent=items.length+' NOMEADOS';empty.hidden=items.length!==0;visible.textContent=String(categories.length).padStart(2,'0');renderTabs();const total=Object.values(voteCounts).reduce((a,b)=>a+b,0);const el=$('total-votes');if(el)el.textContent=total.toLocaleString('pt-PT');renderOverallTop3();
 }
 async function submitVote(){
  const button=$('submit-vote'),status=$('vote-submit-status'),file=$('payment-proof').files[0],email=$('voter-email').value.trim(),payerName=$('payer-name').value.trim(),transaction=$('transaction-reference').value.trim();
  if(Date.now()>=new Date('2026-12-27T23:59:59+00:00').getTime()){status.textContent='A votação encerrou a 27 de Dezembro de 2026. Já não são aceites novas submissões.';button.disabled=true;return}
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
   const payload={category_id:selected.categoryId,nominee_id:selected.nomineeId,user_id:currentUser?.id||null,quantity,payment_method:mbway?'mbway':revolut?'revolut':paypal?'paypal':'multicaixa_express',currency:(paypal||manualEuro)?'EUR':'AOA',amount:total,payment_reference:ref.textContent,transaction_reference:submittedTransaction,voter_email:email||null,payer_name:manualEuro?payerName:null,proof_path:proofPath,status:'pending'};
   const saved=await sb.from('vote_submissions').insert(payload);
   if(saved.error){await sb.storage.from('payment-proofs').remove([proofPath]);throw new Error('O ficheiro foi enviado, mas a base de dados recusou a submissão: '+saved.error.message);}
   status.textContent='Submissão recebida! O teu voto está pendente de validação do pagamento. Ainda não foi contado.';
   button.textContent='SUBMISSÃO RECEBIDA';
   setTimeout(()=>{closeVote();button.disabled=false;button.textContent='ENVIAR VOTO E COMPROVATIVO'},3500);
  }catch(error){console.error('Vote submission failed',error);status.textContent='Não foi possível registar. '+(error.message||'Tenta novamente ou contacta a organização.');button.disabled=false}
 }
 search.addEventListener('input',render);document.querySelector('.menu-toggle').addEventListener('click',()=>document.querySelector('.topbar').classList.toggle('nav-open'));$('close-vote').addEventListener('click',closeVote);$('cancel-vote').addEventListener('click',closeVote);modal.addEventListener('click',e=>{if(e.target===modal)closeVote()});qty.addEventListener('input',updatePayment);qty.addEventListener('change',updatePayment);if(bulkOffer)bulkOffer.addEventListener('click',()=>{if(bulkPicker&&bulkPicker.hidden){qty.value=10;}else if(Number(qty.value)<10||Number(qty.value)>50||Number(qty.value)%10!==0){qty.value=10;}updatePayment();if(bulkPicker)bulkPicker.hidden=false;});
 if(bulkPackCount)bulkPackCount.addEventListener('change',()=>{qty.value=Number(bulkPackCount.value)*10;updatePayment();});if(blackFridayOffer)blackFridayOffer.addEventListener('click',()=>{if(!blackFridayActive())return;qty.value=100;updatePayment()});method.addEventListener('input',updatePayment);method.addEventListener('change',updatePayment);method.addEventListener('click',updatePayment);$('submit-vote').addEventListener('click',submitVote);
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(ref.textContent);copy.textContent='COPIADO!';setTimeout(()=>copy.textContent='COPIAR REFERÊNCIA',1800)}catch{copy.textContent='SELECCIONA E COPIA A REFERÊNCIA'}});

 initAccount().catch(error=>console.error('Account initialisation failed:',error));
 updateBlackFridayTimer();setInterval(updateBlackFridayTimer,1000);
 fallbackData();render();
 loadLiveData().then(()=>render()).catch(e=>{console.error('Live Supabase data unavailable; keeping nominee list visible.',e);render()});
 loadCeoVideo().catch(e=>console.error('CEO video could not be loaded.',e));
 window.setInterval(refreshApprovedRanking,10000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshApprovedRanking()});
 const paymentResult=new URLSearchParams(window.location.search).get('payment');
 if(paymentResult==='success'){
  const banner=document.createElement('div');banner.textContent='Pagamento iniciado com sucesso. Os votos só serão adicionados após validação do pagamento pela organização.';
  banner.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:100000;padding:16px 20px;border:1px solid #42d9cf;border-radius:12px;background:#101a25;color:#fff;font:600 14px/1.5 sans-serif;box-shadow:0 8px 30px #0008';document.body.appendChild(banner);
  window.history.replaceState({},'',window.location.pathname+window.location.hash);
 }
})();