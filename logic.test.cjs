const assert = require('node:assert/strict');
const L = require('./logic.js');
// Every possible insertion position, including empty and larger collections.
for (let size = 0; size <= 100; size++) {
  for (let target = 0; target <= size; target++) {
    let duel = { low: 0, high: size - 1 }, comparisons = 0;
    while (duel.low <= duel.high) {
      const mid = Math.floor((duel.low + duel.high) / 2);
      duel = L.choose(duel, target <= mid);
      assert.ok(++comparisons <= Math.ceil(Math.log2(size + 1)));
    }
    assert.equal(duel.low, target);
  }
}
const lib = L.library([
  { Name: 'Favourite', Rating: 70 }, { Name: 'Other owned', Rating: 90 },
  { Name: 'Nearby', Rating: 91, Value: 1 }, { Name: 'Better value', Rating: 91, Value: 2 },
  { Name: 'Farther', Rating: 98 }, { Name: 'Below', Rating: 89 }, { Name: 'Ignored', Rating: 92 },
]);
const ranked = L.score([{ Name: 'Favourite' }, { Name: 'Other owned' }], lib);
assert.deepEqual(ranked.map(r => r.Internal_Score), [90, 70]);
assert.deepEqual(L.recommendations(lib, ranked, ['Ignored'], 2).map(r => r.Name), ['Better value', 'Nearby']);
assert.deepEqual(new Set(L.recommendations(lib, ranked, ['Ignored']).map(r => r.Name)), new Set(['Nearby', 'Better value', 'Farther', 'Below']));
assert.deepEqual(L.csv('\uFEFFName,Rank,Internal_Score\r\n"Bottle, ""special""",1,88\r\n'), [{ Name: 'Bottle, "special"', Rank: '1', Internal_Score: '88' }]);
assert.throws(() => L.csv('Name\n"unfinished'));
assert.throws(() => L.rankings([{ Name: 'A', Rank: 1 }, { Name: 'a', Rank: 2 }]));
assert.equal(L.rankings([{ Name: 'Old', Rank: 1, My_Score: 87 }])[0].Internal_Score, 87);
assert.equal(L.library([{ Name: '<script>', Rating: 'bad' }])[0].Rating, 0);
console.log('Passed: 5,151 duel positions, recommendation selection, score reassignment, CSV and legacy import checks.');
