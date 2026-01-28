async function inputGame(e) {
  const file = e.target.files[0];
  await emuxDB(await file.arrayBuffer(), file.name);
  await initCore(file);
  //await timer(true);
  //listGame();
}
async function loadGame(name) {
  await initCore(new File([await emuxDB(name)], name));
}