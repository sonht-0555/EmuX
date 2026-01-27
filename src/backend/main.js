async function inputGame(e) {
    const file = e.target.files[0];
    await emuxDB(await file.arrayBuffer(), file.name);
    await initCore(file);
    await gameView(gameName);
    list.hidden = false, list01.hidden = true, list02.hidden = true;
    //await timer(true);
    //listGame();
}
async function loadGame(name) {
  await initCore(new File([await emuxDB(name)], name));
  await gameView(gameName);
}