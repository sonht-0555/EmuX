// ===== Core =====
  function env_cb() { return 0 }
  async function loadRomFile(file) {
  // await initAudio();
  // setRatio(CORE_CONFIG[core].ratio);
  // setRunning(true)
  await initAudio();
  await initCore(file);
  await initGame(file);
  if (isRunning === true) document.getElementById("rom").style.display = 'none';
}
document.addEventListener("DOMContentLoaded", () => {
// ===== ROM Loader =====
  document.getElementById("resume").onclick = () => { audioCtx && audioCtx.resume() };
  document.getElementById("rom").onchange = async (e) => { loadRomFile(e.target.files[0]) };
  document.querySelectorAll('.btn-control').forEach(btn => {
    const key = btn.getAttribute('data-btn');
    btn.addEventListener('mousedown', () => { press(key); });
    btn.addEventListener('touchstart', e => { press(key); e.preventDefault(); });
    btn.addEventListener('mouseup', () => { unpress(key); });
    btn.addEventListener('mouseleave', () => { unpress(key); });
    btn.addEventListener('touchend', e => { unpress(key); e.preventDefault(); });
    btn.addEventListener('touchcancel', e => { unpress(key); e.preventDefault(); });
  });
});