async function inputGame(e) {
  console.log('[inputGame] Event triggered:', e);

  if (!e.target.files || e.target.files.length === 0) {
    console.error('[inputGame] No file selected');
    alert('No file selected. Please try again.');
    return;
  }

  const file = e.target.files[0];
  console.log('[inputGame] File selected:', file.name, 'Size:', file.size, 'Type:', file.type);

  try {
    console.log('[inputGame] Saving to database...');
    await emuxDB(await file.arrayBuffer(), file.name);
    console.log('[inputGame] Database save complete');

    console.log('[inputGame] Initializing core...');
    await initCore(file);
    console.log('[inputGame] Core initialized successfully');

    list.hidden = false;
    list01.hidden = true;
    list02.hidden = true;
    //await timer(true);
    //listGame();
  } catch (error) {
    console.error('[inputGame] Error:', error);
    alert('Error loading game: ' + error.message);
  }
}
async function loadGame(name) {
  await initCore(new File([await emuxDB(name)], name));
}