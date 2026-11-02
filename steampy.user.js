// ==UserScript==
// @name         SteamPY CDKey 订阅提醒
// @namespace    local.steampy.monitor
// @version      1.3.1
// @description  详情页订阅、心理价、浏览器通知及邮件 webhook
// @match        https://steampy.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  'use strict';
  if (window.top !== window.self) return;
  const read = () => GM_getValue('subscriptions', {});
  let busy = false;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999;background:#fff;color:#222;padding:18px;border:1px solid #ddd;border-radius:12px;box-shadow:0 5px 24px #0003;width:300px;font:14px/1.6 sans-serif';
  const heading = document.createElement('strong'); heading.textContent = 'CDKey 价格订阅'; box.append(heading);
  const status = document.createElement('div'); box.append(status);
  function button(text, handler) {
    const b = document.createElement('button'); b.textContent = text;
    b.style.cssText = 'margin:6px 6px 0 0;padding:5px 10px;cursor:pointer'; b.onclick = handler; box.append(b); return b;
  }
  function component(doc = unsafeWindow.document) {
    for (const el of doc.querySelectorAll('.market-content,.market-detail')) {
      let v = el.__vue__;
      // Access page Vue instances through the userscript bridge.
      if (!v) {
        const candidates = doc.querySelectorAll('.market-content,.market-detail');
        v = Array.from(candidates).find(x => x === el)?.__vue__;
      }
      for (let i = 0; v && i < 6; i++, v = v.$parent) {
        if (v.$options?.name === 'cdkDetail' && typeof v.listKeyApi === 'function') return v;
      }
    }
    return null;
  }
  function current() {
    const v = component(); const q = new URL(location.href).searchParams;
    if (location.pathname !== '/cdkDetail' || !v || v.loading || !v.gameData.gameName || String(v.searchForm.gameId) !== q.get('gameId')) return null;
    return {v, id: q.get('gameId'), area: q.get('name'), name: v.gameData.gameName};
  }
  const subscribe = button('订阅', () => {
    const c = current(); if (!c) return alert('请等待游戏详情加载完成。');
    const key = `${c.area}:${c.id}`, all = read();
    const value = prompt(`${c.name}\n请输入心理价（人民币）；严格低于此价时提醒：`, all[key]?.target ?? '');
    if (value === null) return;
    if (!/^\d+(\.\d{1,2})?$/.test(value.trim()) || Number(value) <= 0) return alert('请输入大于零、最多两位小数的金额。');
    all[key] = {id:c.id, area:c.area, name:c.name, target:Number(value), below:false, url:location.href};
    GM_setValue('subscriptions', all); status.textContent = '订阅已保存，正在检查…'; check();
  });
  const unsubscribe = button('取消订阅', () => {
    const c = current(); if (!c) return;
    const all = read(); delete all[`${c.area}:${c.id}`]; GM_setValue('subscriptions', all); status.textContent = '已取消当前游戏订阅';
  });
  button('邮件设置', () => {
    const old = GM_getValue('mail', {});
    const url = prompt('邮件转发接口 HTTPS URL（将收到游戏名称、价格、链接和收件地址）：', old.url || '');
    if (url === null) return;
    try { if (new URL(url).protocol !== 'https:') throw Error(); } catch { return alert('必须使用有效的 HTTPS 地址'); }
    const to = prompt('收件邮箱：', old.to || ''); if (!to) return;
    const token = prompt('接口 Bearer token（不要填邮箱密码）：', old.token || ''); if (token === null) return;
    GM_setValue('mail', {url,to,token}); status.textContent = '邮件设置已保存';
  });
  button('立即检查', () => check());
  button('开启浏览器通知', async () => {
    try {
      if (!('Notification' in window)) throw Error('当前浏览器不支持桌面通知');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw Error('通知未获授权，请在浏览器的网站权限中允许 SteamPY 发送通知');
      GM_setValue('browserNotifications', true);
      status.textContent = '浏览器通知已开启';
      check();
    } catch (e) { status.textContent = e.message; }
  });
  button('关闭浏览器通知', () => {
    GM_setValue('browserNotifications', false); status.textContent = '浏览器通知已关闭';
  });
  button('测试通知', () => {
    try { notify({name:'通知测试', area:'test', id:'test', target:100, url:location.href}, 99); status.textContent='测试通知已提交；若未显示，请检查系统通知或勿扰设置'; }
    catch(e) {status.textContent=e.message;}
  });
  function notify(g, amount) {
    if (!GM_getValue('browserNotifications', true) || !('Notification' in window) || Notification.permission !== 'granted') {
      throw Error('请先点击“开启浏览器通知”并允许通知');
    }
    const n = new Notification('SteamPY cdKey 价格提醒', {
      body:message(g, amount),
      tag:`steampy-${g.area}-${g.id}`
    });
    n.onclick = () => {
      const url = new URL(g.url);
      if (url.origin === location.origin) { window.focus(); location.href=url.href; }
      n.close();
    };
  }
  function message(g, amount) {
    return `SteamPY上${g.name}已出现价格为¥${Number(amount).toFixed(2)}的cdKey，请尽快查看${g.url}`;
  }
  let listDialog;
  button('订阅列表', () => {
    if(listDialog?.isConnected) { listDialog.focus(); return; }
    const dialog=document.createElement('dialog');listDialog=dialog;
    dialog.style.cssText='width:min(760px,90vw);max-height:85vh;overflow:auto;padding:20px;border:1px solid #ddd;border-radius:12px;background:white;color:#222;font:14px/1.6 sans-serif';
    const title=document.createElement('h3'), search=document.createElement('input'), rows=document.createElement('div');
    search.placeholder='搜索游戏名称或地区';search.style.cssText='width:100%;box-sizing:border-box;padding:8px;margin:10px 0';
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();
    dialog.append(title,close,search,rows);
    function render(){
      const entries=Object.entries(read()), term=search.value.trim().toLowerCase();
      const shown=entries.filter(([,g])=>`${g.name} ${g.area}`.toLowerCase().includes(term));
      title.textContent=`全部订阅：${entries.length} 款 · 显示 ${shown.length} 款`;
      rows.replaceChildren();
      for(const [key,g] of shown){
        const row=document.createElement('section');row.style.cssText='padding:12px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere';
        const link=document.createElement('a');link.textContent=`${g.name} [${g.area}]`;link.href=`https://steampy.com/cdkDetail?name=${encodeURIComponent(g.area)}&gameId=${encodeURIComponent(g.id)}`;link.target='_blank';link.rel='noopener noreferrer';
        const detail=document.createElement('div');detail.textContent=`心理价：¥${g.target} · 上次最低价：${g.price == null?'未检查':'¥'+g.price} · ${g.checked || '尚无成功检查'}`;
        const error=document.createElement('div');error.textContent=g.lastError?`最近检查失败：${g.lastError}`:'';error.style.color='#b91c1c';
        const remove=document.createElement('button');remove.textContent='取消订阅';remove.onclick=()=>{const all=read();delete all[key];GM_setValue('subscriptions',all);render();};
        row.append(link,detail,error,remove);rows.append(row);
      }
      if(!shown.length)rows.textContent=entries.length?'没有匹配的订阅':'暂无订阅';
    }
    search.oninput=render;const refresh=setInterval(render,2000);
    dialog.addEventListener('close',()=>{clearInterval(refresh);dialog.remove();listDialog=null;});
    document.body.append(dialog);render();dialog.showModal();
  });
  async function queryPrices(g) {
    const params={pageNumber:1,pageSize:20,sort:'keyPrice',order:'asc',startDate:'',endDate:'',gameId:g.id};
    const c=current();let frame;
    try {
      let v=c?.area===g.area?c.v:null;
      if(!v){
        frame=document.createElement('iframe');
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:800px;pointer-events:none';
        frame.title='SteamPY 订阅价格检查';
        frame.src=`https://steampy.com/cdkDetail?name=${encodeURIComponent(g.area)}&gameId=${encodeURIComponent(g.id)}`;
        document.body.append(frame);
        const deadline=Date.now()+45000;
        while(Date.now()<deadline){
          try {v=component(frame.contentDocument);if(v && !v.loading && String(v.searchForm.gameId)===String(g.id) && v.areas===g.area)break;v=null;}catch{v=null;}
          await new Promise(resolve=>setTimeout(resolve,500));
        }
        if(!v)throw Error('后台详情页未能加载，请打开该商品确认登录或完成验证');
      }
      let timer;
      try {return await Promise.race([v.listKeyApi(params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('价格请求超时')),30000);})]);}
      finally{clearTimeout(timer);}
    }finally{frame?.remove();}
  }
  function send(g, price) {
    const cfg = GM_getValue('mail', {});
    if (!cfg.url || !cfg.to) return Promise.reject(Error('请先配置邮件转发接口和收件邮箱'));
    return new Promise((resolve,reject) => GM_xmlhttpRequest({
      method:'POST', url:cfg.url, timeout:30000,
      headers:{'Content-Type':'application/json', ...(cfg.token ? {Authorization:`Bearer ${cfg.token}`} : {})},
      data:JSON.stringify({to:cfg.to, subject:`SteamPY 降价：${g.name} ¥${price}`, text:message(g, price), gameId:g.id, area:g.area, price, target:g.target}),
      onload:r => r.status >= 200 && r.status < 300 ? resolve() : reject(Error(`邮件接口 HTTP ${r.status}`)),
      onerror:() => reject(Error('邮件接口连接失败')), ontimeout:() => reject(Error('邮件接口超时'))
    }));
  }
  async function run() {
    const entries = Object.entries(read());let succeeded=0,failed=0;
    for (const [key,g] of entries) {
      try {
        status.textContent=`检查 ${succeeded+failed+1}/${entries.length}：${g.name}`;
        const response = await queryPrices(g);
        if (!response?.success || !Array.isArray(response.result?.content)) throw Error('报价接口失败或需要重新登录');
        const rows = response.result.content;
        if (!rows.length) throw Error('暂无在售报价');
        if (rows.some(r => !Number.isFinite(Number(r.keyPrice)) || Number(r.keyPrice)<=0)) throw Error('报价格式异常');
        if (rows.some((r,i) => i && Number(r.keyPrice)<Number(rows[i-1].keyPrice))) throw Error('服务器未按价格升序返回');
        const available = rows.filter(r => Number(r.stock)>0);
        if (!available.length) throw Error('最低价结果暂无库存，未作降价判断');
        const amount = Math.min(...available.map(r => Number(r.keyPrice)));
        let latest = read(); if (!latest[key] || latest[key].target !== g.target) continue;
        const below = Math.round(amount*100)<Math.round(g.target*100);
        let browserSent = below && !!latest[key].browserSent;
        let emailSent = below && !!(latest[key].emailSent ?? latest[key].below);
        const notes = [];
        if (below && !browserSent && GM_getValue('browserNotifications', true)) {
          try { notify(g, amount); browserSent=true; } catch(e) { notes.push(e.message); }
        }
        // Persist each channel separately so a mail failure cannot repeat browser alerts.
        latest[key] = {...latest[key], browserSent, emailSent}; GM_setValue('subscriptions',latest);
        const mail = GM_getValue('mail', {});
        if (below && !emailSent && mail.url && mail.to) {
          try { await send(g, amount); emailSent=true; } catch(e) { notes.push(`${e.message}，下轮重试`); }
        }
        latest = read(); if (!latest[key] || latest[key].target !== g.target) continue;
        latest[key] = {...latest[key], below, browserSent, emailSent, price:amount, checked:new Date().toLocaleString(),lastError:notes.join('；')}; GM_setValue('subscriptions',latest);succeeded++;
        const channels = [browserSent ? '浏览器通知已提交' : '', emailSent ? '邮件已发送' : ''].filter(Boolean);
        status.textContent = `${g.name}：¥${amount}${below ? `（${channels.join('、') || '已达心理价，请开启通知或配置邮件'}）` : ''}${notes.length ? '；'+notes.join('；') : ''}`;
      } catch (e) { failed++;const all=read();if(all[key]){all[key].lastError=e.message;GM_setValue('subscriptions',all);} status.textContent = `${g.name}：${e.message}；下轮重试`; console.warn('[SteamPY订阅]',e); }
    }
    status.textContent=entries.length?`检查完成：报价成功 ${succeeded}，失败 ${failed}。提醒状态及错误请查看订阅列表。`:'暂无订阅';
  }
  async function check() {
    if (busy) {status.textContent='检查正在进行，请稍候';return;} busy = true;
    try {
      if (!navigator.locks) throw Error('浏览器不支持 Web Locks，请升级浏览器');
      await navigator.locks.request('steampy-subscription-check', {ifAvailable:true}, async lock => { if (lock) await run(); else status.textContent='其他 SteamPY 标签页正在检查'; });
    } catch(e) {status.textContent=e.message;} finally {busy=false;}
  }
  document.body.append(box);
  function updatePanel(){const c=current();const detail=location.pathname==='/cdkDetail';subscribe.hidden=unsubscribe.hidden=!detail;subscribe.textContent=c && read()[`${c.area}:${c.id}`]?'修改订阅':'订阅';}
  updatePanel();setInterval(updatePanel,1000);
  setInterval(check,300000);
  setTimeout(check,5000);
})();

