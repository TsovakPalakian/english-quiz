import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/learning-stage-worker.mjs';
const host='dashboard.example.invalid';
for(const path of ['/material-quiz.js','/color-picker.js','/messages.js','/messages.css'])test('Dashboard serves built asset '+path,async()=>{
  let reads=0;
  const response=await worker.fetch(new Request('https://'+host+path+'?v=fixture'),{
    STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:host,
    STUDY_DB:{prepare(){throw new Error('Public assets must not query D1');},batch(){throw new Error('Public assets must not query D1');}},
    ASSETS:{fetch:async()=>{reads++;return new Response('fixture asset');}},
  });
  assert.equal(response.status,200,await response.clone().text());
  assert.equal(reads,1);
  assert.match(response.headers.get('cache-control'),/immutable/);
});
for(const i of [1,2,3,4,5]){
  const badgePath='/badges/badge-'+i+'-symbol.png';
  test('Stage worker serves static badge symbol '+badgePath,async()=>{
    let reads=0;
    const response=await worker.fetch(new Request('https://'+host+badgePath),{
      STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:host,
      STUDY_DB:{prepare(){throw new Error('Public badge assets must not query D1');},batch(){throw new Error('Public badge assets must not query D1');}},
      ASSETS:{fetch:async()=>{reads++;return new Response('badge-png-bytes',{headers:{'Content-Type':'image/png'}});}},
    });
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(reads,1);
  });
}
test('Unknown paths are not made public by the dashboard asset fix',async()=>{
  const response=await worker.fetch(new Request('https://'+host+'/private.json'),{
    STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:host,ASSETS:{fetch(){throw new Error('must not serve');}},
  });
  assert.equal(response.status,501);
});
