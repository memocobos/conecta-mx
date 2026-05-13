const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await page.goto('http://localhost:8765/rol.html');
  await page.evaluate(() => {
    localStorage.setItem('rol-usuario', 'Test');
    localStorage.removeItem('rol-tours');
    Object.keys(localStorage).forEach(k => { if(k.startsWith('rol-paid::')||k.startsWith('rol-paidAt::')) localStorage.removeItem(k); });
  });
  await page.goto('http://localhost:8765/rol.html');
  await page.waitForFunction(() => window.EV && window.EV.length > 0, {timeout: 5000});

  async function runFlow(habName, expectedPerP) {
    try{ await page.click('#btn-back-home', {timeout:1000}); }catch{}
    await sleep(100);
    await page.click('#btn-add-tour');
    await sleep(150);
    await page.fill('#q', 'J Balvin');
    await sleep(150);
    await page.click('.ev-item[data-id="jbalvin"]');
    await sleep(150);
    await page.click('.pkg[data-p="plus"]');
    await sleep(150);
    await page.selectOption('#zona-select', '0');
    await sleep(150);
    await page.evaluate((name) => {
      var btns = document.querySelectorAll('.hab');
      for(var i=0;i<btns.length;i++){
        if(btns[i].textContent.indexOf(name)>=0) { btns[i].click(); return; }
      }
    }, habName);
    await sleep(150);
    const habState = await page.evaluate(() => ({
      n: state.hab && state.hab.n,
      e: state.hab && state.hab.e,
      pp: state.hab && state.hab.pp,
      precio: state.precio,
      zonaP: state.zona && state.zona.p,
    }));
    await page.click('#btn-calc');
    await sleep(300);
    const perP = await page.evaluate(() => state.plan && state.plan.perP);
    const sumTotal = (await page.locator('#sum-total').textContent()).trim();
    const ok = perP === expectedPerP;
    console.log(`[${habName.padEnd(12)}] zonaP:${habState.zonaP} hab.pp:${habState.pp} → perP:${perP} sum:${sumTotal} esperado:$${expectedPerP.toLocaleString('es-MX')} ${ok?'✓':'✗ FALLA'}`);
    return ok;
  }

  console.log('=== TEST 1: Hab suma al total (Cancha VIP $4,600) ===');
  const r1 = await runFlow('Compartida', 4600);
  const r2 = await runFlow('Triple', 4850);
  const r3 = await runFlow('Doble', 5250);
  const r4 = await runFlow('Individual', 6560);

  // TEST 2: Verificar que hab se distribuye en pagos mensuales (con Karol G a 6 meses)
  console.log('\n=== TEST 2: Hab se distribuye en quincenas (Karol G Nov 2026) ===');
  try{ await page.click('#btn-back-home', {timeout:1000}); }catch{}
  await sleep(100);
  await page.click('#btn-add-tour');
  await sleep(150);
  await page.fill('#q', 'Karol G en Monterrey');
  await sleep(150);
  await page.click('.ev-item[data-id="karolg"]');
  await sleep(150);
  // multifecha: click la primera fecha
  await page.click('.mf');
  await sleep(150);
  await page.click('.pkg[data-p="plus"]');
  await sleep(150);
  // Zona "Norte General" — buscar
  const opts = await page.locator('#zona-select option').allTextContents();
  const idxNorteGen = opts.findIndex(t => t.indexOf('Norte General')>=0);
  await page.selectOption('#zona-select', String(idxNorteGen - 1));
  await sleep(150);
  // Click Individual hab (+$1960 / persona)
  await page.evaluate(() => {
    var btns = document.querySelectorAll('.hab');
    for(var i=0;i<btns.length;i++){
      if(btns[i].textContent.indexOf('Individual')>=0){btns[i].click();return;}
    }
  });
  await sleep(150);
  await page.click('#btn-calc');
  await sleep(300);

  const plan = await page.evaluate(() => {
    var p = state.plan;
    return { perP: p.perP, sepActual: p.sepActual, resto: p.resto, n: p.quincenas.length, pagoQ: p.pagoQ };
  });
  // Karol G Norte General p:4600, Individual pp:1960 → perP = 6560
  // sep PLUS = 1000 (>15 días). resto = 5560. n quincenas (10 máx)
  console.log(`perP:${plan.perP} sepActual:${plan.sepActual} resto:${plan.resto} quincenas:${plan.n} pagoQ:${plan.pagoQ}`);

  // Suma de TODAS las filas debe = perP (incluyendo last quincena que ajusta)
  const tableSum = await page.evaluate(() => {
    var rows = buildRows();
    return rows.reduce((s,r)=>s+r.amount, 0);
  });
  const r5 = tableSum === plan.perP;
  console.log(`Suma de filas: $${tableSum.toLocaleString('es-MX')} = perP $${plan.perP.toLocaleString('es-MX')} ${r5?'✓':'✗ FALLA'}`);

  // Verificar que hab está distribuida en quincenas (no solo separo)
  // Sin hab: perP=4600, resto=3600, pagoQ≈360
  // Con hab Individual+1960: perP=6560, resto=5560, pagoQ≈556
  const habDistribuida = plan.n > 0 && plan.pagoQ > 360;
  console.log(`Hab distribuida en quincenas (pagoQ=${plan.pagoQ} > 360 baseline sin hab) ${habDistribuida?'✓':'✗ FALLA'}`);

  const pass = [r1,r2,r3,r4,r5,habDistribuida].filter(Boolean).length;
  console.log('\nResultado:', pass + '/6 tests pasaron');
  await browser.close();
  process.exit(pass===6 ? 0 : 1);
})();
