import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {renderReviewItems,readReviewItems,defaultReviewItems,emptyReviewItems,editReviewItems,reviewItemPreview} from '../client/demos/quiz-review-editor.js';
import {validateReviewContent} from '../src/quiz-review-content.mjs';
import {reviewSamples} from './quiz-review-samples.mjs';
test('main editor starts with empty author fields, not invented contexts or distractors',()=>{
  const window=new Window(),root=window.document.createElement('div');try{
    for(const type of [...Object.keys(reviewSamples),'Video choice']){
      const items=emptyReviewItems(type,{word:'bank',translation:'банк'});root.innerHTML=renderReviewItems(type,items);
      assert.deepEqual(readReviewItems(type,root),items,type);assert.doesNotMatch(JSON.stringify(items),/drizzle|opened an account|fine drizzle/);
    }
  }finally{window.happyDOM.abort();}
});
test('all 17 structured forms round-trip every item without JSON or data loss',()=>{
  const window=new Window(),root=window.document.createElement('div');
  try{assert.equal(Object.keys(reviewSamples).length,17);
    for(const [type,items] of Object.entries(reviewSamples)){
      root.innerHTML=renderReviewItems(type,items);
      const read=readReviewItems(type,root);assert.deepEqual(read,items,type);
      assert.doesNotThrow(()=>validateReviewContent(type,{explanation:'A reviewed explanation.',items:read}),type);
      const preview=items.map(item=>reviewItemPreview(type,item)).join('');assert.ok(!preview.includes('undefined'),type);
    }
  }finally{window.happyDOM.abort();}
});
test('removing options preserves correct-answer indexes and min item/option counts',()=>{
  const window=new Window(),root=window.document.createElement('div');
  try{
    const items=structuredClone(reviewSamples['Select all']);root.innerHTML=renderReviewItems('Select all',items);
    const result=editReviewItems('Select all',items,root.querySelector('[data-remove-option="0"]'));
    assert.deepEqual(result[0].options,['rain','spoon']);assert.deepEqual(result[0].answers,[0]);
    root.innerHTML=renderReviewItems('Select all',result);
    assert.equal(editReviewItems('Select all',result,root.querySelector('[data-remove-option="0"]'))[0].options.length,2);
    const pairs=structuredClone(reviewSamples.Match);root.innerHTML=renderReviewItems('Match',pairs);
    assert.equal(editReviewItems('Match',pairs,root.querySelector('[data-remove-item]')).length,2);
  }finally{window.happyDOM.abort();}
});
test('editor output escapes text and creates independent added items',()=>{
  const window=new Window(),root=window.document.createElement('div');
  try{
    const items=[{prompt:'<img src=x onerror=alert(1)>',answer:'word'}];root.innerHTML=renderReviewItems('Type',items);
    assert.equal(root.querySelector('img'),null);assert.deepEqual(readReviewItems('Type',root),items);
    const add=window.document.createElement('button');add.id='add-quiz-item';
    const extended=editReviewItems('Type',items,add);extended[1].answer='changed';assert.equal(items[0].answer,'word');
    for(const type of Object.keys(reviewSamples))assert.ok(defaultReviewItems(type,{word:'drizzle',translation:'изморось',meaning:'Light rain.'}).length);
  }finally{window.happyDOM.abort();}
});
