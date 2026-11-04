(() => {
  'use strict';
  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => Array.from(scope.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = $('.motion-button');
  const masthead = $('.masthead');
  const progress = $('.reading-progress');
  let savedMotion = null;
  try { savedMotion = sessionStorage.getItem('case-motion'); } catch (_) { /* Storage is optional. */ }
  let paused = savedMotion === null ? reduced.matches : savedMotion === 'paused';
  const motionChanged = new EventTarget();

  function setMotion(value, persist = false) {
    paused = value;
    document.documentElement.classList.toggle('motion-paused', paused);
    motionButton?.setAttribute('aria-pressed', String(paused));
    motionButton?.setAttribute('aria-label', paused ? 'Resume motion' : 'Pause motion');
    motionButton?.setAttribute('title', paused ? 'Resume motion' : 'Pause motion');
    if (persist) { try { sessionStorage.setItem('case-motion', paused ? 'paused' : 'playing'); } catch (_) {} }
    motionChanged.dispatchEvent(new Event('change'));
  }
  motionButton?.addEventListener('click', () => setMotion(!paused, true));
  reduced.addEventListener('change', event => setMotion(event.matches));
  setMotion(paused);

  let scrollPending = false;
  function updateScroll() {
    masthead?.classList.toggle('scrolled', window.scrollY > 60);
    const range = document.documentElement.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${range > 0 ? Math.min(1, window.scrollY / range) : 0})`;
    scrollPending = false;
  }
  addEventListener('scroll', () => {
    if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  // Keep the service index below the live masthead as its padding changes.
  const serviceJump = $('.service-jump');
  if (serviceJump && masthead) {
    const sizeServiceNavigation = () => {
      document.documentElement.style.setProperty('--masthead-height', `${masthead.getBoundingClientRect().height}px`);
      document.documentElement.style.setProperty('--service-jump-height', `${serviceJump.getBoundingClientRect().height}px`);
    };
    const serviceNavigationSize = new ResizeObserver(sizeServiceNavigation);
    serviceNavigationSize.observe(masthead, { box: 'border-box' });
    serviceNavigationSize.observe(serviceJump, { box: 'border-box' });
    sizeServiceNavigation();
  }

  // Native dialogs retain keyboard focus and Escape handling.
  const menu = $('#site-menu');
  const menuButton = $('.menu-button');
  const gallery = $('#gallery-dialog');
  function syncDialogs() {
    document.body.classList.toggle('locked', Boolean(menu?.open || gallery?.open));
    menuButton?.setAttribute('aria-expanded', String(Boolean(menu?.open)));
    motionChanged.dispatchEvent(new Event('change'));
  }
  menuButton?.addEventListener('click', () => { menu.showModal(); syncDialogs(); });
  $('.close-menu')?.addEventListener('click', () => menu.close());
  menu?.addEventListener('close', syncDialogs);
  $$('a', menu).forEach(a => a.addEventListener('click', () => menu.close()));

  // Image carousel uses elapsed time so pausing preserves the displayed frame.
  const hero = $('.hero');
  if (hero) {
    const slides = $$('.hero-image');
    const links = $$('.hero-project');
    const count = $('.slide-number');
    const announcement = $('.hero-status');
    const video = $('.hero-video');
    let current = 0;
    let elapsed = 0;
    let last = 0;
    let visible = true;
    let playing = false;
    let videoFailed = false;
    let focused = false;
    let frame = 0;
    const canLoadVideo = () => innerWidth > 800 && !navigator.connection?.saveData;
    function active() { return !paused && !focused && !document.hidden && visible && !menu?.open && !gallery?.open; }
    function syncVideo() {
      if (!video || videoFailed) return;
      const shouldPlay = active() && current === 0 && canLoadVideo();
      if (shouldPlay && !video.src) { video.src = video.dataset.src; video.load(); }
      if (shouldPlay && !playing) {
        playing = true;
        video.play().then(() => video.classList.add('ready')).catch(() => { playing = false; });
      } else if (!shouldPlay && playing) { video.pause(); playing = false; }
    }
    video?.addEventListener('error', () => { videoFailed = true; video.classList.remove('ready'); });
    function show(index, announce = false) {
      current = (index + slides.length) % slides.length;
      elapsed = 0;
      slides.forEach((slide, i) => slide.classList.toggle('active', i === current));
      links.forEach((link, i) => {
        link.classList.toggle('active', i === current);
        link.style.setProperty('--slide-progress', '0');
        if (i === current) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
      });
      count.textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
      if (announce && announcement) {
        const name = links[current].children[1].textContent.trim();
        announcement.textContent = `${name}. Photograph ${current + 1} of ${slides.length}.`;
      }
      syncVideo();
    }
    $('.slide-prev').addEventListener('click', () => show(current - 1, true));
    $('.slide-next').addEventListener('click', () => show(current + 1, true));
    links.forEach((link, i) => link.addEventListener('pointerenter', () => { if (!paused && current !== i) show(i); }));
    function syncPlayback() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      syncVideo();
      if (active()) frame = requestAnimationFrame(tick);
    }
    hero.addEventListener('focusin', () => { focused = true; syncPlayback(); });
    hero.addEventListener('focusout', event => {
      focused = Boolean(event.relatedTarget && hero.contains(event.relatedTarget));
      syncPlayback();
    });
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: .08 }).observe(hero);
    motionChanged.addEventListener('change', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    function tick(time) {
      frame = 0;
      if (!active()) return;
      const delta = last ? Math.min(80, time - last) : 0;
      last = time;
      if (active()) {
        elapsed += delta;
        const duration = current === 0 ? 18000 : 8500;
        links[current].style.setProperty('--slide-progress', String(Math.min(1, elapsed / duration)));
        if (elapsed >= duration) show(current + 1);
      }
      frame = requestAnimationFrame(tick);
    }
    show(0);
    syncPlayback();
  }

  // Project filters and the alternative list view have shareable URLs.
  const grid = $('.portfolio-grid');
  if (grid) {
    const items = $$('.portfolio-item', grid);
    const filters = $$('[data-filter]');
    const views = $$('.view-switch [data-view]');
    let selectedFilter = 'all';
    let selectedView = 'grid';
    function renderPortfolio(writeUrl = false) {
      let visibleCount = 0;
      items.forEach(item => {
        const show = selectedFilter === 'all' || item.dataset.tags.split(' ').includes(selectedFilter);
        item.hidden = !show;
        item.classList.toggle('offset', show && visibleCount % 2 === 1);
        if (show) visibleCount++;
      });
      filters.forEach(button => {
        const selected = button.dataset.filter === selectedFilter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      views.forEach(button => {
        const selected = button.dataset.view === selectedView;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      grid.dataset.view = selectedView;
      const activeLabel = filters.find(button => button.dataset.filter === selectedFilter)?.textContent.trim();
      $('.filter-status').textContent = selectedFilter === 'all' ? 'Selected projects' : `Selected projects · ${activeLabel}`;
      if (writeUrl) {
        const url = new URL(location.href);
        selectedFilter === 'all' ? url.searchParams.delete('sector') : url.searchParams.set('sector', selectedFilter);
        selectedView === 'grid' ? url.searchParams.delete('view') : url.searchParams.set('view', selectedView);
        history.pushState(null, '', url);
      }
      updateScroll();
    }
    function fromUrl() {
      const params = new URLSearchParams(location.search);
      selectedFilter = filters.some(b => b.dataset.filter === params.get('sector')) ? params.get('sector') : 'all';
      selectedView = params.get('view') === 'list' ? 'list' : 'grid';
      renderPortfolio();
    }
    filters.forEach(button => button.addEventListener('click', () => {
      if (selectedFilter === button.dataset.filter) return;
      selectedFilter = button.dataset.filter; renderPortfolio(true);
    }));
    views.forEach(button => button.addEventListener('click', () => {
      if (selectedView === button.dataset.view) return;
      selectedView = button.dataset.view; renderPortfolio(true);
    }));
    addEventListener('popstate', fromUrl);
    fromUrl();
  }

  if (gallery) {
    let photographs = [];
    let index = 0;
    const full = $('.gallery-full');
    function displayImage(next) {
      index = (next + photographs.length) % photographs.length;
      const photo = photographs[index];
      full.src = photo.src;
      full.alt = photo.caption;
      $('.gallery-caption').textContent = photo.caption;
      $('.gallery-credit').textContent = photo.credit;
      $('.gallery-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(photographs.length).padStart(2, '0')}`;
      $('.gallery-prev').hidden = photographs.length < 2;
      $('.gallery-next').hidden = photographs.length < 2;
    }
    $$('.gallery-trigger').forEach(button => button.addEventListener('click', () => {
      const project = button.closest('.project-gallery');
      try { photographs = JSON.parse(project.dataset.gallery); } catch (_) { return; }
      if (!photographs.length) return;
      $('.gallery-name').textContent = project.dataset.galleryName;
      displayImage(Number(button.dataset.galleryIndex) || 0);
      gallery.showModal();
      syncDialogs();
    }));
    $('.gallery-close').addEventListener('click', () => gallery.close());
    $('.gallery-prev').addEventListener('click', () => displayImage(index - 1));
    $('.gallery-next').addEventListener('click', () => displayImage(index + 1));
    gallery.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') { event.preventDefault(); displayImage(index + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); displayImage(index - 1); }
    });
    gallery.addEventListener('close', syncDialogs);
  }

  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const status = $('.copy-status');
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      status.textContent = 'Email address copied.';
      button.textContent = 'Copy again';
    } catch (_) {
      status.textContent = 'Select the email address above to copy it, or open your email app.';
    }
  }));

  // Editorial text is always visible; motion is reserved for project imagery.
  // Only one film plays at a time; moving away from a case-study film pauses it.
  $$('.project-film video').forEach(video => {
    new IntersectionObserver(entries => { if (!entries[0].isIntersecting) video.pause(); }, { threshold: .1 }).observe(video);
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  });
  document.body.classList.add('enhanced');
})();
