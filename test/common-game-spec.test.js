import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEffects, SOUND_PREFERENCE_KEY } from '../js/sound-effects.js';
import { PlayerProfile } from '../js/player-profile.js';
import * as sharing from '../js/result-share.js';
import { RANKING_LIMIT } from '../js/ranking-client.js';
const storage = (entries = {}) => ({ getItem: k => entries[k] ?? null, setItem: (k,v) => { entries[k] = v; } });
test('first visit enables sound while stored false and zero remain effective', () => {
 assert.equal(new SoundEffects({storage:storage()}).getSnapshot().enabled,true);
 assert.equal(new SoundEffects({storage:storage({[SOUND_PREFERENCE_KEY]:'false'})}).getSnapshot().enabled,false);
 const s=storage(); const a=new SoundEffects({storage:s}); a.setVolume(0);
 assert.equal(new SoundEffects({storage:s}).getSnapshot().volume,0);
});
test('clearing a name persists the next-play opt out without destroying profile storage', () => {
 const s=storage(); const p=new PlayerProfile({storage:s}); p.saveName('名前');
 assert.equal(p.saveName('　 ').ok,true); assert.equal(p.getName(),'');
 assert.equal(new PlayerProfile({storage:s}).getName(),'');
});
test('X intent opens encoded text and blocked popup copies full content', async () => {
 let opened; const content={text:'サイノメ\n300秒 & 100点',copyText:'サイノメ\n300秒 & 100点'};
 assert.equal(await sharing.shareOnX(content,{open:url=>{opened=url;return {};}}), 'opened');
 assert.equal(new URL(opened).searchParams.get('text'),content.text);
 let copied; assert.equal(await sharing.shareOnX(content,{open:()=>null,navigatorObject:{clipboard:{writeText:async text=>{copied=text;}}}}),'copied');
 assert.equal(copied,content.text);
});
test('result ranking asks server for thirty aggregate entries',()=>assert.equal(RANKING_LIMIT,30));

import { TRANSLATIONS } from '../js/translations.js';
test('common action and consent text has a complete catalog in all fifteen languages', () => {
 for (const [language, messages] of Object.entries(TRANSLATIONS)) {
  for (const key of ['Xでシェア','ランキング','上位30名','音量','名前なし','Xの投稿画面を開きました','名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。名前は20文字以内です。']) {
   assert.equal(typeof messages[key], 'string', `${language}: ${key}`);
   if(language !== 'ja') assert.doesNotMatch(messages[key], /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  }
 }
});
