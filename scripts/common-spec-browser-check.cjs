const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const root = resolve(__dirname, '..');
  const server = createServer(async (request, response) => {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    try { response.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
    catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport:{width:393,height:852},locale:'ja-JP' });
    const errors = []; const writes = []; const reads = []; const receipts = new Map(); let loseNextReceipt = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/npm/three@0.185.1/**', route => route.fulfill({path:resolve(root, 'node_modules/three', route.request().url().split('three@0.185.1/')[1]), contentType:'text/javascript'}));
    await page.route('**/rest/v1/rpc/**', async route => {
      const rpc=route.request().url().split('/').pop(), body=route.request().postDataJSON();
      if(rpc === 'get_best_score_ranking') {
        reads.push(body);
        await route.fulfill({json:Array.from({length:30},(_,i)=>({rank_no:i<2?1:i+1,display_name:`参加者${i}長い名前`,best_score:1000-i,play_count:1}))});
      } else {
        writes.push({rpc,body});
        if (rpc === 'record_game_play') {
          await route.fulfill({json:{accepted:true,display_name:body.p_display_name,game_slug:body.p_game_slug,result_type:'play'}});
        } else {
          assert.equal(rpc,'submit_score_once_shared_v1','never fall back to legacy submit_score');
          const duplicate=receipts.has(body.p_submission_id);
          const receipt=receipts.get(body.p_submission_id)??{accepted:true,result_display_name:body.p_display_name,result_best_score:body.p_score,result_play_count:1,is_first_play:true,is_new_best:true};
          receipts.set(body.p_submission_id,receipt);
          if(loseNextReceipt){loseNextReceipt=false;await route.abort();}
          else await route.fulfill({json:[{...receipt,was_duplicate:duplicate}]});
        }
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>document.querySelector('#language-select').options.length===15);
    const languages=await page.locator('#language-select option').evaluateAll(items=>items.map(item=>item.value));
    for(const language of languages) { await page.selectOption('#language-select',language); assert.ok(await page.locator('#home-share-button').textContent()); }
    await page.selectOption('#language-select','ja');
    await page.fill('#player-name-input','　 '); await page.click('#start-button');
    await page.locator('#pause-button').waitFor({state:'visible'});
    await page.click('#pause-button'); await page.click('#retire-button');
    await page.waitForFunction(()=>document.querySelectorAll('#result-ranking-list li').length===30);
    assert.equal(writes.length,0); assert.equal(reads.at(-1).p_limit,30);
    assert.equal(await page.locator('#result-player-name').textContent(),'名前なし');
    assert.equal(await page.locator('#result-share-button').textContent(),'Xでシェア');
    await page.click('#result-home-button'); await page.fill('#player-name-input','最初の名前');
    await page.locator('#player-name-input').blur(); assert.equal(writes.length,0,'later name must not publish guest history');
    await page.click('#start-button'); await page.locator('#pause-button').waitFor({state:'visible'});
    await page.evaluate(()=>{const input=document.querySelector('#player-name-input');input.value='次回の名前';input.dispatchEvent(new Event('change'));});
    await page.click('#pause-button'); await page.click('#retire-button');
    await page.waitForFunction(()=>document.querySelector('#result-ranking-status').textContent.includes('送信できませんでした'));
    assert.equal(writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length,1);
    const first=structuredClone(writes.at(-1).body);
    assert.equal(first.p_display_name,'最初の名前');assert.match(first.p_submission_id,/^[0-9a-f-]{36}$/);
    await page.evaluate(()=>{const selector=document.querySelector('#language-select');selector.value='en';selector.dispatchEvent(new Event('change'));});
    assert.equal(writes.filter(x=>x.rpc==='submit_score_once_shared_v1').length,1,'rerender must not resubmit');
    // Lost acknowledgement must survive reload; manual retry reuses the same receipt.
    await page.reload();await page.locator('#pending-ranking-retry').waitFor({state:'visible'});
    await page.click('#pending-ranking-retry');await page.locator('#pending-ranking-panel').waitFor({state:'hidden'});
    const submitted=writes.filter(x=>x.rpc==='submit_score_once_shared_v1');
    assert.equal(submitted.length,2);assert.deepEqual(submitted[1].body,first);assert.equal(receipts.size,1);
    await page.selectOption('#language-select','ja');
    await page.fill('#player-name-input','');await page.click('#start-button');await page.locator('#pause-button').waitFor({state:'visible'});
    await page.click('#pause-button');await page.click('#retire-button');await page.waitForFunction(()=>document.querySelectorAll('#result-ranking-list li').length===30);
    for(const viewport of [{width:852,height:393},{width:393,height:600}]) {
      await page.setViewportSize(viewport);
      assert.ok(await page.locator('#result-ranking-link').isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.evaluate(()=>{document.querySelector('#sound-volume').value='0';document.querySelector('#sound-volume').dispatchEvent(new Event('input'));});
    await page.click('#sound-toggle'); await page.reload();
    assert.equal(await page.locator('#sound-volume').inputValue(),'0');
    assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
    assert.deepEqual(errors,[]);
    console.log('Chromium: 15 languages; guest start/result and later name; 30 rows; immutable named result; lost acceptance + reload uses same receipt; no resubmit on language change; narrow/landscape layout; stored sound off/zero passed. All Supabase calls mocked.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
