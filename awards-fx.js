(() => {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'awards-fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  let width = 0, height = 0, frame = 0, last = 0, lastAward = 0, lastBurst = 0;
  const particles = [], awards = [];
  const colors = ['#f4d28b', '#e9bd72', '#fff1c9', '#ffcf7a', '#f7a8cf'];
  const maxParticles = window.innerWidth < 650 ? 100 : 180;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function burst(x, y) {
    const count = window.innerWidth < 650 ? 24 : 38;
    for (let i = 0; i < count && particles.length < maxParticles; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * .12;
      const speed = 1.1 + Math.random() * 3.1;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        life:55+Math.random()*30,age:0,size:1.2+Math.random()*2.1,
        color:colors[Math.floor(Math.random()*colors.length)]});
    }
  }
  function award() {
    awards.push({x:Math.random()*width,y:-35,size:17+Math.random()*13,
      speed:.8+Math.random()*1.25,drift:(Math.random()-.5)*.8,
      spin:(Math.random()-.5)*.035,angle:(Math.random()-.5)*.5,
      glyph:Math.random()>.32?'🏆':'✦',alpha:.68+Math.random()*.3});
  }
  function draw(now) {
    if (document.hidden) { frame=requestAnimationFrame(draw); return; }
    const delta = Math.min(2,(now-last)/16.67 || 1); last=now;
    ctx.clearRect(0,0,width,height);
    if (now-lastAward > (now < 14000 ? 850 : 2100) && awards.length < 18) { award(); lastAward=now; }
    if (now-lastBurst > (now < 18000 ? 2400 : 7200)) {
      burst(width*(.16+Math.random()*.68), height*(.13+Math.random()*.35));
      if (now < 18000 && Math.random()>.45) burst(width*(.16+Math.random()*.68), height*(.12+Math.random()*.3));
      lastBurst=now;
    }
    for (let i=awards.length-1;i>=0;i--) {
      const a=awards[i]; a.y+=a.speed*delta; a.x+=a.drift*delta; a.angle+=a.spin*delta;
      ctx.save();ctx.globalAlpha=a.alpha;ctx.translate(a.x,a.y);ctx.rotate(a.angle);
      ctx.font=a.size+'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#e9bd72';ctx.shadowBlur=9;
      ctx.fillText(a.glyph,0,0);ctx.restore();
      if(a.y>height+45)awards.splice(i,1);
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.age+=delta;p.x+=p.vx*delta;p.y+=p.vy*delta;p.vy+=.035*delta;p.vx*=.992;
      const alpha=Math.max(0,1-p.age/p.life);
      ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=7;
      ctx.beginPath();ctx.arc(p.x,p.y,p.size*alpha,0,Math.PI*2);ctx.fill();
      if(p.age>=p.life)particles.splice(i,1);
    }
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    frame=requestAnimationFrame(draw);
  }
  resize();
  window.addEventListener('resize',resize,{passive:true});
  frame=requestAnimationFrame(draw);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
})();