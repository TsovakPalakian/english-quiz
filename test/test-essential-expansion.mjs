import test from 'node:test';
import assert from 'node:assert/strict';
import {expandEssential} from '../src/essential-expansion.mjs';
import {everydayGroups} from '../src/essential-data.mjs';
import {grammarDetails} from '../src/grammar-content.mjs';

function createMockGroups() {
  return [
    {id: 'speech', title: 'Speech essentials', topics: []},
    {id: 'basics', title: 'Basic sets', topics: []},
    {id: 'topics', title: 'Topics', topics: []}
  ];
}

test('expandEssential populates all three groups with 116 topics and 1257 vocabulary entries', () => {
  const groups = createMockGroups();
  expandEssential(groups);

  const speech = groups.find((g) => g.id === 'speech');
  const basics = groups.find((g) => g.id === 'basics');
  const topics = groups.find((g) => g.id === 'topics');

  assert.ok(speech);
  assert.ok(basics);
  assert.ok(topics);

  assert.equal(speech.topics.length, 15);
  assert.equal(basics.topics.length, 13);
  assert.equal(topics.topics.length, 88);

  let totalEntries = 0;
  for (const group of groups) {
    for (const topic of group.topics) {
      assert.ok(topic.id);
      assert.ok(topic.title);
      assert.ok(Array.isArray(topic.entries));
      assert.ok(topic.entries.length > 0, `Topic ${topic.title} must have entries`);
      totalEntries += topic.entries.length;
    }
  }

  assert.equal(totalEntries, 1257);
});

test('expandEssential entries possess valid schema fields and non-empty strings', () => {
  const groups = createMockGroups();
  expandEssential(groups);

  for (const group of groups) {
    for (const topic of group.topics) {
      for (const entry of topic.entries) {
        assert.equal(typeof entry.en, 'string');
        assert.ok(entry.en.trim().length > 0);

        assert.equal(typeof entry.ru, 'string');
        assert.ok(entry.ru.trim().length > 0);

        assert.equal(typeof entry.example, 'string');
        assert.ok(entry.example.trim().length > 0);

        assert.equal(typeof entry.exampleRu, 'string');
        assert.ok(entry.exampleRu.trim().length > 0);

        assert.equal(typeof entry.pos, 'string');
        assert.ok(entry.pos.trim().length > 0);

        if ('source' in entry) {
          assert.equal(typeof entry.source, 'string');
          assert.ok(entry.source.trim().length > 0);
        }
      }
    }
  }
});

test('expandEssential is idempotent and does not produce duplicate entries on repeated execution', () => {
  const groups = createMockGroups();
  expandEssential(groups);

  const initialCounts = groups.map((g) => g.topics.reduce((sum, t) => sum + t.entries.length, 0));

  // Run a second time on the same structure
  expandEssential(groups);

  const repeatedCounts = groups.map((g) => g.topics.reduce((sum, t) => sum + t.entries.length, 0));
  assert.deepEqual(repeatedCounts, initialCounts);
});

test('expandEssential appends entries into pre-existing topics without overwriting', () => {
  const groups = [
    {
      id: 'speech',
      title: 'Speech essentials',
      topics: [
        {
          id: 'topic-reflexive-pronouns',
          title: 'Reflexive pronouns',
          entries: [{en: 'custom_self', ru: 'кастомный', example: 'Ex', exampleRu: 'Прим', pos: 'pronoun'}]
        }
      ]
    },
    {id: 'basics', title: 'Basic sets', topics: []},
    {id: 'topics', title: 'Topics', topics: []}
  ];

  expandEssential(groups);

  const topic = groups[0].topics.find((t) => t.title === 'Reflexive pronouns');
  assert.ok(topic);
  assert.equal(topic.entries[0].en, 'custom_self');
  // Built-in entries appended after existing
  assert.ok(topic.entries.some((e) => e.en === 'myself'));
});

test('expandEssential formats topic IDs as kebab-case or respects extra.id', () => {
  const groups = createMockGroups();
  expandEssential(groups);

  const reflexive = groups[0].topics.find((t) => t.title === 'Reflexive pronouns');
  assert.equal(reflexive.id, 'topic-reflexive-pronouns');

  const indefinite = groups[0].topics.find((t) => t.title === 'Indefinite pronouns');
  assert.equal(indefinite.id, 'topic-indefinite-pronouns');

  // Grammar topic uses explicit extra.id
  const grammar = groups[2].topics.find((t) => t.title === 'Grammar and language');
  assert.equal(grammar.id, 'topic-grammar');
  assert.equal(grammar.entries[0].source, 'Grammatical Categories');
});

test('expandEssential integrates complete grammarDetails from grammar-content.mjs', () => {
  const groups = createMockGroups();
  expandEssential(groups);

  const grammarTopic = groups[2].topics.find((t) => t.id === 'topic-grammar');
  assert.ok(grammarTopic);

  const expectedGrammarKeys = Object.keys(grammarDetails);
  assert.equal(grammarTopic.entries.length, expectedGrammarKeys.length);

  for (const [key, detail] of Object.entries(grammarDetails)) {
    const entry = grammarTopic.entries.find((e) => e.en.toLowerCase() === key.toLowerCase());
    assert.ok(entry, `Grammar entry ${key} must exist in topic`);
    assert.equal(entry.ru, detail.ru);
    assert.equal(entry.example, detail.en);
    assert.equal(entry.exampleRu, detail.definition);
  }
});

test('everydayGroups export contains integrated essential vocabulary', () => {
  assert.equal(Array.isArray(everydayGroups), true);
  assert.equal(everydayGroups.length, 3);

  const [speech, basics, topics] = everydayGroups;
  assert.equal(speech.id, 'speech');
  assert.equal(basics.id, 'basics');
  assert.equal(topics.id, 'topics');

  const totalTopics = everydayGroups.reduce((acc, g) => acc + g.topics.length, 0);
  const totalEntries = everydayGroups.reduce((acc, g) => acc + g.topics.reduce((s, t) => s + t.entries.length, 0), 0);

  assert.equal(totalTopics, 125);
  assert.equal(totalEntries, 1338);
});
