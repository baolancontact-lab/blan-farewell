'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const data = window.BLAN_DATA;
  const layer = $('#modal-layer');
  const recipients = data.recipients;
  let currentScene = 'welcome', generation = 0, galleryReady = false;
  let soundOn = true, audio, lastFocus, toastTimer, modalGeneration = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const escape = str => String(str).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function showScene(id) {
    document.querySelectorAll('.scene').forEach(el => el.hidden = el.id !== id);
    currentScene = id;
    $('#active-task span').textContent = id === 'welcome' ? 'last_day.exe' : 'Những kỷ niệm';
  }
  function chime(kind = 'click') {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume().catch(() => {});
      const notes = kind === 'startup' ? [261.63,329.63,392,523.25] : kind === 'open' ? [523.25,659.25,783.99] : [440];
      notes.forEach((frequency, index) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        const start = audio.currentTime + index * .16;
        osc.type = 'triangle'; osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.055, start + .015);
        gain.gain.exponentialRampToValueAtTime(.001, start + .45);
        osc.connect(gain); gain.connect(audio.destination);
        osc.start(start); osc.stop(start + .5);
      });
    } catch { /* The card remains usable without audio support. */ }
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4500);
  }
  function draggable(el) {
    const handle = $('.drag-handle', el); if (!handle) return;
    let movement;
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || event.button !== 0 || matchMedia('(max-width:700px)').matches) return;
      const bounds = el.getBoundingClientRect();
      movement = {x:event.clientX,y:event.clientY,dx:Number(el.dataset.dx || 0),dy:Number(el.dataset.dy || 0),bounds};
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!movement) return;
      const {bounds} = movement;
      const dx = Math.min(innerWidth - bounds.right - 8, Math.max(8 - bounds.left, event.clientX - movement.x));
      const dy = Math.min(innerHeight - 90 - bounds.top, Math.max(8 - bounds.top, event.clientY - movement.y));
      el.dataset.dx = movement.dx + dx; el.dataset.dy = movement.dy + dy;
      el.style.transform = `translate(${el.dataset.dx}px, ${el.dataset.dy}px)`;
    });
    const end = () => movement = null;
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  }
  function closeModal() {
    modalGeneration++; layer.replaceChildren(); document.body.classList.remove('modal-open');
    if (lastFocus?.isConnected && lastFocus.getClientRects().length) lastFocus.focus();
    else if (!$('#open-folder').hidden && currentScene === 'gallery') $('#open-folder').focus();
    else $('#active-task').focus();
  }
  function dialog(title, html, cls = '', back) {
    if (!layer.firstChild) lastFocus = document.activeElement;
    modalGeneration++;
    layer.innerHTML = `<section class="window dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="titlebar drag-handle"><span id="dialog-title">${escape(title)}</span><div class="window-controls"><button class="modal-close" aria-label="Đóng cửa sổ">×</button></div></div><div class="dialog-content">${html}</div></section>`;
    document.body.classList.add('modal-open');
    $('.modal-close', layer).addEventListener('click', closeModal);
    draggable($('.dialog', layer));
    const backButton = $('[data-back]', layer); if (backButton && back) backButton.addEventListener('click', back);
    const initial = $('[autofocus]', layer) || $('.modal-close', layer);
    requestAnimationFrame(() => {if (initial.isConnected) initial.focus({preventScroll:true});});
  }
  layer.addEventListener('keydown', event => {
    if (event.key === 'Escape') {event.preventDefault(); closeModal(); return;}
    if (event.key !== 'Tab') return;
    const focusable = [...layer.querySelectorAll('button,input,a[href],textarea,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !layer.firstChild && currentScene === 'welcome') minimizeWelcome();
  });
  function makePhoto(photo, index, expanded = false) {
    if (photo.src) {
      const img = document.createElement('img');
      img.className = expanded ? 'photo-expanded' : 'photo-image'; img.src = photo.src;
      img.alt = photo.alt || photo.caption || `Kỷ niệm ${index + 1}`;
      img.addEventListener('error', () => img.replaceWith(makePhoto({...photo,src:''}, index, expanded)), {once:true});
      return img;
    }
    const div = document.createElement('div'); div.className = `photo-placeholder${expanded ? ' placeholder-expanded' : ''}`;
    div.style.setProperty('--photo-bg', ['#e8daf3','#f1dce5','#d9d7ee','#e7dfed','#e4d3eb','#eadfe0'][index % 6]);
    div.innerHTML = `<span aria-hidden="true">${['♡','✿','✧','☕','☆','☺'][index % 6]}</span><small>CHỜ ẢNH KỶ NIỆM ${String(index + 1).padStart(2,'0')}</small>`;
    return div;
  }
  const photos = data.photos.length ? data.photos : Array.from({length:6}, (_,i) => ({caption:`Kỷ niệm ${String(i+1).padStart(2,'0')} · chờ ảnh của team`}));
  photos.forEach((photo,index) => {
    const figure = document.createElement('figure'); figure.className = 'photo-card';
    figure.style.setProperty('--tilt', `${[-5,3,-3,4,-4,4][index%6]}deg`);
    figure.style.setProperty('--offset', `${[8,-4,12,5,15,0][index%6]}px`);
    const button = document.createElement('button'); button.setAttribute('aria-label', `Xem ảnh: ${photo.caption || index + 1}`);
    button.append(makePhoto(photo,index));
    const caption = document.createElement('figcaption'); caption.textContent = photo.caption || `Kỷ niệm ${index+1}`;
    button.append(caption); figure.append(button); $('#photo-board').insertBefore(figure, $('#letters-entry'));
    button.addEventListener('click', () => {
      dialog('▧ memories / một khoảnh khắc', '<figure id="expanded-photo"></figure>', 'photo-dialog');
      $('#expanded-photo').append(makePhoto(photo,index,true));
      const text = document.createElement('figcaption'); text.textContent = photo.caption || ''; $('#expanded-photo').append(text);
    });
  });
  async function recover() {
    if (currentScene !== 'welcome') {toast('Kỷ niệm đang được khôi phục rồi nha. ♡'); return;}
    chime('startup'); const run = ++generation; showScene('loading');
    galleryReady = false; $('#letters-entry').hidden = true;
    document.querySelectorAll('.photo-card').forEach(card => card.classList.remove('arrived'));
    const bar = $('.progress-track');
    $('#progress-fill').style.width = '0%'; $('#progress-value').textContent = '0%'; bar.setAttribute('aria-valuenow','0');
    for (let progress = 0; progress <= 100; progress += 2) {
      if (run !== generation) return;
      $('#progress-fill').style.width = `${progress}%`; $('#progress-value').textContent = `${progress}%`; bar.setAttribute('aria-valuenow',progress);
      await sleep(42);
    }
    await sleep(250); if (run !== generation) return;
    showScene('reveal');
    await sleep(3000); if (run !== generation) return;
    showScene('gallery'); scrollTo({top:0,behavior:'instant'});
    const cards = [...document.querySelectorAll('.photo-card')];
    for (const card of cards) {await sleep(420); if (run !== generation) return; card.classList.add('arrived');}
    await sleep(700); if (run !== generation) return;
    $('#letters-entry').hidden = false; galleryReady = true;
  }
  function openFolder() {
    if (!galleryReady) {toast('Khôi phục dữ liệu để mở lại những kỷ niệm nha.'); return;}
    chime('open');
    dialog('▰ Một ít điều nhỏ Blan muốn nói', `<div class="folder-address"><span>Địa chỉ: C:\\Blan\\Một ít điều nhỏ Blan muốn nói</span></div><div class="files-grid">${recipients.map((r,i) => `<button class="file-button" data-recipient="${i}" style="animation-delay:${i*.12}s"><span class="file-icon" aria-hidden="true">♡<span class="file-lock">⌑</span></span><span class="file-name">${escape(r.filename)}</span></button>`).join('')}</div><p class="folder-help">4 lá thư riêng · Mỗi lá thư có một chiếc chìa khóa nhỏ ♡</p><div class="statusbar"><span>4 đối tượng</span><span>Đã lưu bằng cả tấm lòng</span></div>`, 'folder-dialog');
    document.querySelectorAll('[data-recipient]').forEach(button => button.addEventListener('click', () => passwordDialog(Number(button.dataset.recipient))));
  }
  function passwordDialog(index) {
    const recipient = recipients[index]; chime();
    dialog('⌑ Lá thư này được khóa bằng một lời cảm ơn', `<form class="password-content"><div class="password-top"><span class="file-icon" aria-hidden="true">♡</span><div><h2>${escape(recipient.name)}</h2><p>Một vài điều Blan chỉ muốn gửi riêng.</p></div></div><label for="letter-password">Nhập chiếc chìa khóa của bạn</label><div class="input-row"><input autofocus id="letter-password" type="password" autocomplete="off" spellcheck="false" required aria-describedby="password-message" placeholder="Mật khẩu riêng của bạn"><button type="button" id="show-password" aria-label="Hiện mật khẩu" aria-pressed="false">Hiện</button></div><p id="password-message" class="password-message" role="status"></p><div class="password-actions"><button type="button" class="retro-button" data-back>← Quay lại</button><button type="submit" class="retro-button primary" id="unlock">Mở khóa ♡</button></div></form>`, 'password-dialog', openFolder);
    $('#show-password').addEventListener('click', event => {
      const input = $('#letter-password'), show = input.type === 'password'; input.type = show ? 'text' : 'password';
      event.currentTarget.textContent = show ? 'Ẩn' : 'Hiện'; event.currentTarget.setAttribute('aria-pressed',String(show)); event.currentTarget.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    });
    $('.password-content').addEventListener('submit', async event => {
      event.preventDefault();
      const input = $('#letter-password'), unlock = $('#unlock'), message = $('#password-message'), version = modalGeneration;
      unlock.disabled = true; unlock.textContent = 'Đang mở…'; message.textContent = '';
      try {
        if (!window.crypto?.subtle) throw new Error('unsupported');
        const letter = await decrypt(recipient.locked, input.value);
        if (version !== modalGeneration) return;
        input.value = ''; envelopeDialog(index, letter);
      } catch (error) {
        if (version !== modalGeneration) return;
        message.textContent = error.message === 'unsupported' ? 'Hãy mở thiệp bằng localhost hoặc đường dẫn HTTPS để dùng khóa thư.' : 'Chiếc chìa khóa chưa đúng rồi. Bạn thử lại nha ♡';
        input.setAttribute('aria-invalid','true'); input.focus(); input.select();
        const box = $('.password-dialog'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
        unlock.disabled = false; unlock.textContent = 'Mở khóa ♡';
      }
    });
  }
  function from64(str) {return Uint8Array.from(atob(str), c => c.charCodeAt(0));}
  async function decrypt(locked, password) {
    const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:from64(locked.salt),iterations:210000,hash:'SHA-256'},material,512));
    const ciphertext = from64(locked.ciphertext), iv = from64(locked.iv);
    const macKey = await crypto.subtle.importKey('raw',bits.slice(32),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const signed = new Uint8Array(iv.length+ciphertext.length); signed.set(iv); signed.set(ciphertext,iv.length);
    if (!await crypto.subtle.verify('HMAC',macKey,from64(locked.mac),signed)) throw new Error('password');
    const aesKey = await crypto.subtle.importKey('raw',bits.slice(0,32),'AES-CBC',false,['decrypt']);
    const clear = await crypto.subtle.decrypt({name:'AES-CBC',iv},aesKey,ciphertext); bits.fill(0);
    return JSON.parse(new TextDecoder().decode(clear));
  }
  function envelopeDialog(index, letter) {
    chime('open');
    dialog(`✉ Gửi ${recipients[index].name}`, `<div class="envelope-stage"><p class="letter-to">FROM BLAN, WITH LOVE</p><div class="envelope" aria-hidden="true"><div class="envelope-paper">một lời cảm ơn ♡</div><span class="envelope-heart">♡</span></div><p class="envelope-hint">Có một lá thư đang chờ bạn mở.</p><button class="retro-button primary" id="open-letter" autofocus>Mở thư ♡</button></div><article class="letter-sheet" hidden><span class="tiny-label">MỘT ÍT ĐIỀU NHỎ BLAN MUỐN NÓI</span><h2 id="letter-heading"></h2><div class="letter-body" id="letter-body"></div><p class="letter-signature">Thương mến,<br><strong>Blan ♡</strong></p></article><div class="letter-bottom" hidden><button class="retro-button" data-back>← Về thư mục</button></div>`, 'letter-dialog', openFolder);
    $('#letter-heading').textContent = letter.heading || `Gửi ${recipients[index].name},`;
    $('#letter-body').textContent = letter.body;
    $('#open-letter').addEventListener('click', async event => {
      event.currentTarget.disabled = true; const version = modalGeneration;
      $('.envelope').classList.add('opening'); chime('open');
      await sleep(matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 1300);
      if (version !== modalGeneration) return;
      $('.envelope-stage').hidden = true; $('.letter-sheet').hidden = false; $('.letter-bottom').hidden = false;
      $('.dialog-content').scrollTop = 0;
      const heading = $('#letter-heading'); heading.tabIndex = -1; heading.focus({preventScroll:true});
    }, {once:true});
  }
  function contract() {
    chime(); dialog('▣ contract_extension.exe', '<div class="simple-content"><span class="badge">YÊU CẦU: +100 NĂM</span><h2>Yêu cầu thất bại.<br>Nhưng tình đồng nghiệp<br>vẫn còn hiệu lực!</h2><p>Không cần ký lại. Không cần đóng dấu.<br>Tự động gia hạn bằng những lần hỏi thăm. ♡</p><button class="retro-button primary" id="contract-ok" autofocus>Đã hiểu, hẹn gặp lại ♡</button></div>', 'password-dialog');
    $('#contract-ok').addEventListener('click', closeModal);
  }
  function about() {
    dialog('♡ Đọc mình.txt', '<div class="simple-content"><span class="tiny-label">A FAREWELL, SAVED WITH LOVE</span><h2>Một lời chào được lưu lại.</h2><p>Khôi phục dữ liệu để xem lại những khoảnh khắc cùng nhau. Ở cuối thư mục kỷ niệm, có một ít điều nhỏ Blan muốn nói.</p><p>Mỗi lá thư có mật khẩu riêng. Bạn dùng chiếc chìa khóa Blan gửi cho mình nha. ♡</p><button class="retro-button contract-mobile" id="mobile-contract">Gia hạn hợp đồng thêm 100 năm ✧</button></div>', 'password-dialog');
    $('#mobile-contract').addEventListener('click', contract);
  }
  function minimizeWelcome() {$('#welcome-window').hidden = true; toast('Cửa sổ đã thu nhỏ. Bấm last_day.exe ở thanh dưới để mở lại.');}
  $('#recover').addEventListener('click', recover);
  $('#open-folder').addEventListener('click', openFolder);
  $('#memories-shortcut').addEventListener('click', () => {
    if (galleryReady) {showScene('gallery'); scrollTo({top:0,behavior:'smooth'});}
    else if (currentScene === 'welcome') {$('#welcome-window').hidden = false; $('#recover').focus();}
    else toast('Đang mở lại những kỷ niệm, chờ một chút nha. ♡');
  });
  $('#about-shortcut').addEventListener('click', about);
  $('#contract').addEventListener('click', contract);
  $('#home').addEventListener('click', () => {
    closeModal(); generation++; showScene('welcome'); $('#welcome-window').hidden = false; scrollTo({top:0,behavior:'instant'});
  });
  $('#active-task').addEventListener('click', () => {
    if (currentScene === 'welcome') {$('#welcome-window').hidden = false; $('#recover').focus();}
    else if (galleryReady) showScene('gallery');
  });
  $('[data-minimize]').addEventListener('click', minimizeWelcome);
  $('.close-welcome').addEventListener('click', minimizeWelcome);
  $('#sound').addEventListener('click', () => {
    soundOn = !soundOn; $('#sound').setAttribute('aria-pressed',String(soundOn));
    $('#sound').setAttribute('aria-label',soundOn ? 'Tắt âm thanh' : 'Bật âm thanh');
    $('#sound span').textContent = `Âm thanh: ${soundOn ? 'Bật' : 'Tắt'}`;
    if (soundOn) chime('startup'); else if (audio) audio.suspend().catch(() => {});
  });
  function tick() {$('#clock').textContent = new Intl.DateTimeFormat('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date());}
  tick(); setInterval(tick,30000); draggable($('#welcome-window'));
})();
