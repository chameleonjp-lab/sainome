const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const { resolve } = require('node:path');

function measureShareTarget(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    let opacity = 1; let ancestorVisible = true;
    for (let node = element; node; node = node.parentElement) {
      const current = getComputedStyle(node);
      opacity *= Number(current.opacity);
      if (current.display === 'none' || current.visibility === 'hidden' || current.visibility === 'collapse' || node.hidden) ancestorVisible = false;
    }
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
      hit: hit === element || element.contains(hit), background: style.backgroundColor,
      color: style.color, opacity, ancestorVisible, disabled: element.disabled,
      label: element.textContent.trim() };
}

// Tests the real rendered button and real share handler, not a test-only result DOM.
async function checkShareButton(page, selector, { language, screen, engine, screenshot = false }) {
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  const geometry = await button.evaluate(measureShareTarget);
  assert.equal(await button.isVisible(), true, `${screen} ${language}: visible`);
  assert.ok(geometry.width >= 44 && geometry.height >= 44, `${screen}: minimum 44px target ${JSON.stringify(geometry)}`);
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 1 && geometry.top >= 0 && geometry.bottom <= geometry.viewportHeight + 1, `${screen}: scroll-reachable viewport target`);
  assert.equal(geometry.hit, true, `${screen}: no overlay intercepts center`);
  assert.equal(geometry.disabled, false);
  assert.equal(geometry.opacity, 1, 'no transparent ancestor');
  assert.equal(geometry.ancestorVisible, true, 'no hidden ancestor');
  assert.equal(geometry.background, 'rgb(0, 0, 0)');
  assert.equal(geometry.color, 'rgb(255, 255, 255)');
  assert.ok(geometry.label.length > 0);
  if (language === 'ja') assert.equal(geometry.label, 'Xでシェア');
  // A pressed/focused share action must not blend into the surrounding panel.
  await button.focus();
  assert.equal(await button.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(0, 0, 0)', 'focus stays black');
  await page.mouse.move((geometry.left + geometry.right) / 2, (geometry.top + geometry.bottom) / 2);
  await page.mouse.down();
  const pressed = await button.evaluate(element => ({background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color}));
  if (screenshot) {
    const directory = resolve(__dirname, '../test-artifacts/share');
    await mkdir(directory, { recursive: true });
    const viewport = page.viewportSize();
    await page.screenshot({ path: resolve(directory, `${engine}-${language}-${screen}-${viewport.width}x${viewport.height}-pressed.png`) });
  }
  // Release away from the control; the only activation under test below is a real touch tap.
  await page.mouse.move(0, 0); await page.mouse.up();
  assert.equal(pressed.background, 'rgb(0, 0, 0)', 'pressed stays black');
  assert.equal(pressed.color, 'rgb(255, 255, 255)', 'pressed stays white');
  const before = await page.evaluate(() => globalThis.__shareIntents.length);
  await button.tap();
  await page.waitForFunction(count => globalThis.__shareIntents.length === count + 1, before);
  const intent = new URL(await page.evaluate(() => globalThis.__shareIntents.at(-1)));
  assert.equal(intent.origin, 'https://x.com');
  assert.equal(intent.pathname, '/intent/post');
  assert.match(intent.searchParams.get('text'), /https:\/\/chameleonjp-lab\.github\.io\/sainome\//);
  if (screen === 'result') {
    assert.ok(intent.searchParams.get('text').includes(await page.locator('#result-score').textContent()), 'shares displayed current score');
  }
  await page.waitForFunction(id => !document.querySelector(id).disabled, selector);
  if (screenshot) {
    const directory = resolve(__dirname, '../test-artifacts/share');
    await mkdir(directory, { recursive: true });
    const viewport = page.viewportSize();
    await page.screenshot({ path: resolve(directory, `${engine}-${language}-${screen}-${viewport.width}x${viewport.height}.png`) });
  }
}

async function checkShareAcceptance(page, languages, engine) {
  const representative = new Set(['ja', 'en', 'de']);
  const home = page.locator('#home-share-button');
  // Negative controls prove ancestor invisibility is detected; restore before real UI flow.
  for (const [property, value] of [['opacity', '0'], ['display', 'none']]) {
    const previous = await home.evaluate((element, [property, value]) => {
      const parent = element.parentElement; const previous = parent.style[property]; parent.style[property] = value; return previous;
    }, [property, value]);
    try {
      const hidden = await home.evaluate(measureShareTarget);
      assert.ok(hidden.opacity === 0 || !hidden.ancestorVisible, `negative control ${property} must fail visibility`);
    } finally {
      await home.evaluate((element, [property, previous]) => {element.parentElement.style[property] = previous;}, [property, previous]);
    }
  }
  for (const language of languages) {
    await page.setViewportSize({width:393,height:852});
    await page.selectOption('#language-select', language);
    const viewports = representative.has(language)
      ? [{width:393,height:852},{width:852,height:393},{width:393,height:600}]
      : [{width:393,height:852}];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await checkShareButton(page, '#home-share-button', {language,screen:'home',engine,screenshot:representative.has(language)});
    }
    await page.fill('#player-name-input', '');
    await page.click('#start-button');
    await page.locator('#pause-button').waitFor({state:'visible'});
    if (language === 'ja') {
      const directory = resolve(__dirname, '../test-artifacts/share'); await mkdir(directory, {recursive:true});
      await page.screenshot({path:resolve(directory, `${engine}-actual-game.png`)});
    }
    // Advance only the browser clock; keep production rules/session/result transitions intact.
    await page.clock.fastForward(301000);
    await page.clock.runFor(2000);
    await page.locator('#result-share-button').waitFor({state:'visible'});
    if (language === 'ja') assert.match(await page.locator('#result-kicker').textContent(), /時間切れ/);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await checkShareButton(page, '#result-share-button', {language,screen:'result',engine,screenshot:representative.has(language)});
    }
    await page.click('#result-home-button');
  }
  await page.selectOption('#language-select', 'ja');
  await page.evaluate(() => { globalThis.__blockSharePopup = true; });
  await page.locator('#home-share-button').tap();
  await page.waitForFunction(() => document.querySelector('#home-share-status').textContent.includes('コピーしました'));
  assert.match(await page.evaluate(() => globalThis.__shareCopies.at(-1)), /https:\/\/chameleonjp-lab\.github\.io\/sainome\//);
  await page.evaluate(() => { globalThis.__blockSharePopup = false; });
}
module.exports = { checkShareAcceptance };
