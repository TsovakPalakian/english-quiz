import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzerAiIssue} from '../src/analyzer-client.js';

test('Disabled and failed AI produce a stable bug reason; an unnecessary AI call does not',()=>{
  assert.equal(analyzerAiIssue({stats:{llmEnabled:false,llm:'skipped'}}),'AI text analysis is disabled.');
  assert.equal(analyzerAiIssue({stats:{llm:'disabled'}}),'AI text analysis is disabled.');
  for(const llm of ['unavailable','invalid','timeout'])assert.equal(analyzerAiIssue({stats:{llm}}),'AI text analysis is unavailable.');
  for(const llm of ['ok','not-needed'])assert.equal(analyzerAiIssue({stats:{llmEnabled:true,llm}}),'');
});
