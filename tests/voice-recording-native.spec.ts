import {test,expect} from '@playwright/test';
import {cloudUrl,mockCloud} from './helpers/cloud';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['microphone']});
test('native MediaRecorder preserves a quick-stop recording through preview and playback',async({page,browserName})=>{
 test.skip(!cloudUrl||browserName!=='chromium','Uses Chromium synthetic microphone with the real encoder');
 await mockCloud(page,route=>route.fulfill({json:[]}));await page.goto('/add');await page.getByLabel('Content type').selectOption('expression');await page.locator('summary').filter({hasText:'Add a voice note'}).click();
 for(const label of ['Record audio','Record again']){
  await page.getByRole('button',{name:label,exact:true}).click();await expect(page.getByText('Recording · 0:00')).toBeVisible();await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await expect(page.getByRole('button',{name:'Preview recording',exact:true})).toBeVisible({timeout:10000});await page.getByRole('button',{name:'Preview recording',exact:true}).click();const audio=page.locator('audio[aria-label="Voice note audio"]');await expect.poll(()=>audio.evaluate(node=>(node as HTMLAudioElement).duration)).toBeGreaterThan(0);expect(await audio.evaluate(node=>(node as HTMLAudioElement).duration)).toBeLessThan(3);
 }
});
