// Read only already-rendered X user information. Never guesses from nearby text.
globalThis.XMSProfiles = (() => {
  const reserved = new Set(['home','explore','notifications','messages','settings','search','compose','i','intent','share']);
  const blocks = '[data-testid="User-Name"],[data-testid="UserName"],[data-testid="UserCell"]';
  function linkHandle(link) {
    try { const url=new URL(link.href,location.href),match=/^\/([A-Za-z0-9_]{1,15})\/?$/.exec(url.pathname);return url.protocol==='https:'&&['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname)&&match&&!reserved.has(match[1].toLowerCase())?match[1]:''; } catch { return ''; }
  }
  function avatarUrl(image) {
    try { const u=new URL(image?.currentSrc||image?.getAttribute('src')||'');return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='pbs.twimg.com'&&u.pathname.startsWith('/profile_images/'))||(u.hostname==='abs.twimg.com'&&u.pathname.startsWith('/sticky/default_profile_images/')))?u.href:''; } catch{return '';}
  }
  function fromBlock(block,handle) {
    const key=handle.replace(/^@/,'').toLowerCase();
    const links=[...block.querySelectorAll('a[href]')].filter(link=>linkHandle(link).toLowerCase()===key);
    const exactHandle=[...block.querySelectorAll('span')].some(node=>node.textContent.trim().toLowerCase()==='@'+key);
    if(!links.length&&!exactHandle)return null;
    let name=links.map(link=>link.querySelector('[dir="auto"]')?.textContent||link.textContent).map(s=>s.trim()).find(s=>s&&!s.startsWith('@'))||'';
    if(!name&&block.dataset.testid==='UserName')name=[...block.querySelectorAll('[dir="auto"]')].map(n=>n.textContent.trim()).find(s=>s&&!s.startsWith('@')&&!s.includes('\n'))||'';
    const scopes=[block,block.closest('article'),block.closest('[data-testid="UserCell"]')].filter(Boolean);
    if(block.dataset.testid==='UserName')scopes.push(block.closest('[data-testid="primaryColumn"]')||block.parentElement?.parentElement);
    let avatar='';
    for(const scope of scopes.filter(Boolean)){
      const accountLinks=[...scope.querySelectorAll('a[href]')].filter(link=>linkHandle(link).toLowerCase()===key);
      const accountAvatars=[...scope.querySelectorAll('[data-testid^="UserAvatar-Container-"]')].filter(node=>node.dataset.testid.slice('UserAvatar-Container-'.length).toLowerCase()===key);
      for(const candidate of [...accountLinks,...accountAvatars]){avatar=avatarUrl(candidate.querySelector('img'));if(avatar)break;}
      if(avatar)break;
    }
    return {handle:handle.replace(/^@/,''),displayName:name.slice(0,100),avatarUrl:avatar};
  }
  function scan() {
    const found=new Map();
    for(const block of document.querySelectorAll(blocks)){
      const handles=new Set([...block.querySelectorAll('a[href]')].map(linkHandle).filter(Boolean));
      if(block.dataset.testid==='UserName')for(const node of block.querySelectorAll('span')){const m=/^@([A-Za-z0-9_]{1,15})$/.exec(node.textContent.trim());if(m)handles.add(m[1]);}
      for(const handle of handles){const profile=fromBlock(block,handle);if(!profile)continue;const old=found.get(handle.toLowerCase());found.set(handle.toLowerCase(),{...profile,displayName:profile.displayName||old?.displayName||'',avatarUrl:profile.avatarUrl||old?.avatarUrl||''});}
      if(found.size>=500)break;
    }
    return [...found.values()].slice(0,500);
  }
  function extract(element,handle){const key=handle.replace(/^@/,'').toLowerCase(),block=element?.closest(blocks);return (block&&fromBlock(block,handle))||scan().find(p=>p.handle.toLowerCase()===key)||{handle:handle.replace(/^@/,''),displayName:'',avatarUrl:''};}
  return {scan,extract};
})();
