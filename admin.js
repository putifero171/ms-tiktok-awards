(() => {
 const client=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
 const $=id=>document.getElementById(id);
 let categories=[],nominees=[];
 const say=(id,msg)=>$(id).textContent=msg;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function currentSession(){const {data:{session}}=await client.auth.getSession();if(session)await showDashboard(session);else{$('auth-view').classList.remove('admin-hidden');$('dashboard').classList.add('admin-hidden')}}
 $('auth-form').addEventListener('submit',async e=>{e.preventDefault();say('auth-message','A iniciar sessão...');const {error}=await client.auth.signInWithPassword({email:$('admin-email').value.trim(),password:$('admin-password').value});if(error){say('auth-message',error.message);return}await currentSession()});
 $('signup-btn').addEventListener('click',async()=>{say('auth-message','A criar conta...');const {data,error}=await client.auth.signUp({email:$('admin-email').value.trim(),password:$('admin-password').value});if(error){say('auth-message',error.message);return}say('auth-message','Conta criada. Confirma o email, se solicitado. Depois o administrador principal terá de te atribuir permissões.')});
 $('logout-btn').addEventListener('click',async()=>{await client.auth.signOut();await currentSession()});
 client.auth.onAuthStateChange((_event,session)=>{if(!session){$('dashboard').classList.add('admin-hidden');$('auth-view').classList.remove('admin-hidden')}});
 async function showDashboard(session){
  $('auth-view').classList.add('admin-hidden');$('dashboard').classList.remove('admin-hidden');$('admin-identity').textContent=session.user.email;
  const {data:profile,error}=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
  const role=profile?.role;
  if(error||!['super_admin','admin','vote_approver','content_admin'].includes(role)){$('dashboard').classList.add('admin-hidden');$('auth-view').classList.remove('admin-hidden');say('auth-message','Esta conta não tem permissões activas de administrador.');return}
  window.awardsAdminRole=role;
  const fullAccess=['super_admin','admin'].includes(role);
  $('team-panel').classList.toggle('admin-hidden',role!=='super_admin');
  ['add-category','save-nominee','delete-nominee','add-nominee'].forEach(id=>$(id).closest('.admin-panel').classList.toggle('admin-hidden',!fullAccess));
  $('submissions-body').closest('.admin-panel').classList.toggle('admin-hidden',!['super_admin','admin','vote_approver'].includes(role));
  say('dashboard-message','Sessão activa · '+({super_admin:'Super Admin',admin:'Admin',vote_approver:'Vote Approval',content_admin:'Content Admin'}[role]||role));
  if(role!=='vote_approver') await loadCategories();
  if(role!=='vote_approver') await loadNominees();
  if(role!=='content_admin') await loadSubmissions();
 }
 async function loadAll(){await loadCategories();await loadNominees();await loadSubmissions()}
 async function loadCategories(){
  const {data,error}=await client.from('categories').select('id,title,display_order').order('display_order');
  if(error){say('dashboard-message',error.message);return}categories=data||[];
  ['edit-category','new-category'].forEach(id=>{$(id).innerHTML=categories.map(c=>'<option value="'+c.id+'">'+esc(c.title)+'</option>').join('')});
 }
 async function loadNominees(){
  const {data,error}=await client.from('nominees').select('id,name,category_id,image_path,display_order').eq('is_active',true).order('display_order');
  if(error){say('dashboard-message',error.message);return}nominees=data||[];populateNominees();
 }
 function populateNominees(){
  const cat=$('edit-category').value||categories[0]?.id;
  const list=nominees.filter(n=>n.category_id===cat);
  $('edit-nominee').innerHTML=list.map(n=>'<option value="'+n.id+'">'+esc(n.name)+'</option>').join('');
  showSelectedNominee();
 }
 function showSelectedNominee(){const n=nominees.find(x=>x.id===$('edit-nominee').value);$('nominee-name').value=n?.name||''}
 $('edit-category').addEventListener('change',populateNominees);$('edit-nominee').addEventListener('change',showSelectedNominee);
 async function loadSubmissions(){
  const {data,error}=await client.from('vote_submissions').select('id,created_at,quantity,payment_method,amount,currency,payment_reference,transaction_reference,voter_email,proof_path,status,nominees(name),categories(title)').eq('status','pending').order('created_at',{ascending:true});
  if(error){say('dashboard-message',error.message);return}
  $('submissions-body').innerHTML=(data||[]).map(v=>'<tr><td>'+new Date(v.created_at).toLocaleString('pt-PT')+'</td><td>'+esc(v.nominees?.name)+'<br><small>'+esc(v.categories?.title)+'</small></td><td>'+v.quantity+'</td><td>'+esc(v.payment_method)+'<br>'+esc(v.amount)+' '+esc(v.currency)+'</td><td>'+esc(v.voter_email)+'<br><small>'+esc(v.transaction_reference)+'</small></td><td>'+esc(v.payment_reference)+'</td><td>'+(v.proof_path?'<button class="admin-btn secondary" data-proof="'+esc(v.proof_path)+'">VER</button>':'—')+'</td><td><button class="admin-btn" data-approve="'+v.id+'">APROVAR</button><button class="admin-btn danger" data-reject="'+v.id+'">REJEITAR</button></td></tr>').join('')||'<tr><td colspan="8">Não existem submissões pendentes.</td></tr>';
 }
 $('refresh-submissions')?.addEventListener('click',loadSubmissions);
 $('submissions-body').addEventListener('click',async e=>{
  const proof=e.target.dataset.proof;if(proof){const {data,error}=await client.storage.from('payment-proofs').createSignedUrl(proof,90);if(error){say('dashboard-message',error.message);return}window.open(data.signedUrl,'_blank','noopener');return}
  const approve=e.target.dataset.approve,reject=e.target.dataset.reject,id=approve||reject;if(!id)return;
  const next=approve?'approved':'rejected';if(!confirm('Confirmas '+(approve?'a aprovação':'a rejeição')+' desta submissão?'))return;
  const {error}=await client.rpc('admin_review_vote_submission',{submission_id:id,decision:next});
  if(error){say('dashboard-message',error.message);return}say('dashboard-message','Submissão '+(approve?'aprovada.':'rejeitada.'));await loadSubmissions();
 });
 $('save-nominee').addEventListener('click',async()=>{
  const id=$('edit-nominee').value,n=nominees.find(x=>x.id===id);if(!n)return;
  const updates={name:$('nominee-name').value.trim()};if(!updates.name){say('dashboard-message','Indica um nome válido.');return}
  const file=$('nominee-photo').files[0];
  if(file){if(file.size>5*1024*1024){say('dashboard-message','A imagem excede 5 MB.');return}const ext=file.name.split('.').pop().toLowerCase(),path=id+'/'+Date.now()+'.'+ext;const {error:upErr}=await client.storage.from('nominee-images').upload(path,file,{upsert:true,contentType:file.type});if(upErr){say('dashboard-message',upErr.message);return}updates.image_path=path}
  const {error}=await client.from('nominees').update(updates).eq('id',id);if(error){say('dashboard-message',error.message);return}say('dashboard-message','Nomeado actualizado.');$('nominee-photo').value='';await loadNominees();
 });
 $('delete-nominee').addEventListener('click',async()=>{const id=$('edit-nominee').value;if(!id||!confirm('Remover este nomeado da votação?'))return;say('dashboard-message','A remover nomeado...');const {data,error}=await client.from('nominees').update({is_active:false}).eq('id',id).select('id').maybeSingle();if(error){say('dashboard-message','Não foi possível remover: '+error.message);return}if(!data){say('dashboard-message','Nenhum registo foi actualizado. Verifica as permissões desta conta no Supabase.');return}nominees=nominees.filter(n=>n.id!==id);populateNominees();say('dashboard-message','Nomeado removido da votação. Já não aparece na lista nem no ranking público.');});
 $('add-category').addEventListener('click',async()=>{
  const title=$('new-category-title').value.trim();
  const names=[...new Set($('new-category-nominees').value.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean))];
  if(!title)return say('dashboard-message','Indica o nome da categoria.');
  if(!names.length)return say('dashboard-message','Adiciona pelo menos um nomeado, um por linha.');
  say('dashboard-message','A criar categoria e nomeados...');
  let category=categories.find(c=>c.title.toLocaleLowerCase()===title.toLocaleLowerCase());
  if(!category){
   const {data,error}=await client.from('categories').insert({title,display_order:categories.length+1,is_active:true}).select('id,title,display_order').single();
   if(error){say('dashboard-message',error.message);return}
   category=data;
  }
  const existing=nominees.filter(n=>n.category_id===category.id).map(n=>n.name.toLocaleLowerCase());
  const fresh=names.filter(n=>!existing.includes(n.toLocaleLowerCase()));
  if(fresh.length){
   const rows=fresh.map((name,i)=>({category_id:category.id,name,display_order:existing.length+i+1,is_active:true}));
   const {error}=await client.from('nominees').insert(rows);
   if(error){say('dashboard-message','Categoria criada, mas houve um erro ao adicionar os nomeados: '+error.message);await loadAll();return}
  }
  $('new-category-title').value='';$('new-category-nominees').value='';
  say('dashboard-message','Categoria "'+title+'" guardada. '+fresh.length+' novo(s) nomeado(s) adicionado(s).');
  await loadAll();
 });
 $('save-team-role')?.addEventListener('click',async()=>{
  const email=$('team-email').value.trim(),role=$('team-role').value;
  if(!email)return say('team-message','Indica o email da conta.');
  say('team-message','A actualizar permissões...');
  const {error}=await client.rpc('admin_manage_awards_user',{target_email:email,new_role:role});
  if(error){say('team-message',error.message);return}
  say('team-message','Permissão actualizada para '+email+'. A pessoa deve terminar sessão e voltar a entrar.');
  $('team-email').value='';
 });
 $('add-nominee').addEventListener('click',async()=>{const category_id=$('new-category').value,name=$('new-name').value.trim();if(!name)return say('dashboard-message','Escreve o nome do nomeado.');const {error}=await client.from('nominees').insert({category_id,name,display_order:nominees.filter(n=>n.category_id===category_id).length+1});if(error){say('dashboard-message',error.message);return}$('new-name').value='';say('dashboard-message','Nomeado adicionado.');await loadNominees()});
 currentSession();
})();