import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workbenchReleasePolicy} from '../ops/workbench-release-policy.mjs';
import {validateSpeechRubric} from '../src/speech-assessment.mjs';
test('release policy uses provisional real-provider rubrics and bounded free-tier settings without fixture adapters or automatic selections',()=>{
  const policy=workbenchReleasePolicy();
  assert.equal(policy.approved,true);assert.equal(policy.retentionDays,30);
  for(const rubric of [...policy.speech.rubrics,policy.speech.languageRubric]){
    assert.deepEqual(validateSpeechRubric(rubric),rubric);assert.equal(rubric.approvedBy,null);
    assert.doesNotMatch(JSON.stringify(rubric),/fixture|synthetic|local-/);
  }
  assert.equal(policy.language.freeTierVerified,true);
  assert.equal(policy.language.geminiGeneration,true);assert.equal(policy.language.azure,true);
  assert.equal(policy.speech.budgets.audio.month,1800);
  assert.equal(policy.selections,undefined);assert.equal(policy.language.video,undefined);
  policy.speech.rubrics[0].weights.accuracy=0;
  assert.equal(workbenchReleasePolicy().speech.rubrics[0].weights.accuracy,0.6);
});
