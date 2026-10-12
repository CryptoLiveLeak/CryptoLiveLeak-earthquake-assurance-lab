(() => {
  const frames = [...document.querySelectorAll('.cll-earthquake-lab-frame')];
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'cll-lab-height') return;
    const height = event.data.height;
    if (!Number.isFinite(height) || height < 100 || height > 20000) return;
    for (const frame of frames) {
      if (event.source === frame.contentWindow) frame.style.height = `${Math.ceil(height) + 4}px`;
    }
  });
})();
