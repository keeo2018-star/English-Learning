import {test,expect} from '@playwright/test';
import {mockCloud,cloudUrl,sampleWord} from './helpers/cloud';
// Opt-in read-only provider check: mock the account, never save/delete real rows.
test('live whole-expression recommendations remain grounded in the saved sense',async({page})=>{
 test.skip(!cloudUrl||process.env.NOTED_LIVE_LEXICAL!=='1','Opt-in live public dictionary/Datamuse check');test.setTimeout(60000);
 await mockCloud(page,route=>route.fulfill({json:[{...sampleWord,word:'take stock of',meaning:'全面盘点，整体评估',example:'We need to take stock of the situation.'}]}));
 await page.unroute('**/api/related-words?*');
 await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of',exact:true}).click();const region=page.getByRole('region',{name:'Related Words'});await region.scrollIntoViewIfNeeded();
 await expect(region.getByRole('button',{name:/^Save (assess|evaluate)$/} ).first()).toBeVisible({timeout:45000});
 for(const term of ['stocks','securities','ammunition','ratings','sec'])await expect(region.getByRole('button',{name:`Save ${term}`,exact:true})).toHaveCount(0);
 await page.screenshot({path:'/tmp/noted-live-semantic-related.png'});
});
