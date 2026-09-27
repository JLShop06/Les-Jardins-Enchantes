/* Galerie produit : clic vignette = elle passe en grand, clic grande photo = plein ecran.
   Charge uniquement sur les fiches qui appellent ce script. Aucune dependance. */
(function () {
  'use strict';
  if (window.__ljeGalleryReady) return;
  window.__ljeGalleryReady = 1;
  var frame = document.querySelector('.product-image-frame');
  if (!frame) return;
  var imgs = [].slice.call(frame.querySelectorAll('img'));
  if (!imgs.length) return;

  var CSS = ''
    + '.product-image-frame img{cursor:zoom-in}'
    + '.product-image-frame img:not(:first-child){cursor:pointer;opacity:.82;transition:opacity .25s,transform .25s}'
    + '.product-image-frame img:not(:first-child):hover,.product-image-frame img:not(:first-child):focus{opacity:1;transform:translateY(-2px);outline:none}'
    + '.lje-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(18,10,6,.94);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s}'
    + '.lje-lightbox.is-open{opacity:1}'
    + '.lje-lightbox img{max-width:92vw;max-height:88vh;width:auto;height:auto;border-radius:4px;box-shadow:0 20px 60px rgba(0,0,0,.6)}'
    + '.lje-lb-close,.lje-lb-nav{position:absolute;background:none;border:1px solid rgba(202,168,106,.5);color:#caa86a;font-family:Georgia,serif;cursor:pointer;border-radius:50%;transition:.25s;line-height:1}'
    + '.lje-lb-close{top:18px;right:18px;width:42px;height:42px;font-size:22px}'
    + '.lje-lb-nav{top:50%;transform:translateY(-50%);width:46px;height:46px;font-size:20px}'
    + '.lje-lb-prev{left:18px}.lje-lb-next{right:18px}'
    + '.lje-lb-close:hover,.lje-lb-nav:hover{background:#caa86a;color:#2b1a12}'
    + '@media(max-width:620px){.lje-lb-nav{width:38px;height:38px}.lje-lb-close{top:10px;right:10px}}';
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  var ATTRS = ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'fetchpriority'];
  function swap(a, b) {
    ATTRS.forEach(function (n) {
      var va = a.getAttribute(n), vb = b.getAttribute(n);
      if (vb === null) { a.removeAttribute(n); } else { a.setAttribute(n, vb); }
      if (va === null) { b.removeAttribute(n); } else { b.setAttribute(n, va); }
    });
  }

  var box, boxImg, index = 0;
  function order() { return [].slice.call(frame.querySelectorAll('img')); }

  function show(i) {
    var list = order();
    index = (i + list.length) % list.length;
    boxImg.src = list[index].src;
    boxImg.alt = list[index].alt || '';
  }

  function close() {
    if (!box) return;
    box.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { if (box) { box.remove(); box = null; } }, 200);
  }

  function open(i) {
    box = document.createElement('div');
    box.className = 'lje-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Photo du produit en grand');
    boxImg = document.createElement('img');
    box.appendChild(boxImg);

    var close_ = document.createElement('button');
    close_.className = 'lje-lb-close';
    close_.setAttribute('aria-label', 'Fermer');
    close_.innerHTML = '&times;';
    close_.onclick = close;
    box.appendChild(close_);

    if (order().length > 1) {
      ['prev', 'next'].forEach(function (dir) {
        var b = document.createElement('button');
        b.className = 'lje-lb-nav lje-lb-' + dir;
        b.setAttribute('aria-label', dir === 'prev' ? 'Photo precedente' : 'Photo suivante');
        b.innerHTML = dir === 'prev' ? '&#8249;' : '&#8250;';
        b.onclick = function (e) { e.stopPropagation(); show(index + (dir === 'prev' ? -1 : 1)); };
        box.appendChild(b);
      });
    }

    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    show(i);
    requestAnimationFrame(function () { box.classList.add('is-open'); });
    close_.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!box) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });

  imgs.forEach(function (img, i) {
    if (i > 0) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
    }
    img.addEventListener('click', function () {
      var list = order();
      var pos = list.indexOf(img);
      if (pos === 0) { open(0); } else { swap(list[0], img); }
    });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); img.click(); }
    });
  });
})();
