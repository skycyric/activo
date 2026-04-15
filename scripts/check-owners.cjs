const fs = require('fs');

const data = JSON.parse(fs.readFileSync('test/商務發展部/ogsm_data.json', 'utf8'));
const dept = data.departments[0];

// 檢查 activities 中的 owner
console.log('📌 檢查 dept.activities 中的 owner 欄位:');
if (dept.activities && dept.activities.length > 0) {
  dept.activities.slice(0, 3).forEach((act, i) => {
    console.log(`  Activity ${i}: owner='${act.owner}'`);
    if (act.assistUnits) {
      console.log(`    assistUnits:`, act.assistUnits.map(u => `${u.type}:${u.id}`));
    }
  });
}

// 檢查舊格式 measures 中的 owner
console.log('\n📌 檢查舊格式 strategy.measures 中的 owner 欄位:');
const period = dept.periods[0];
const goal = period.ogsm.goals[0];
const strategy = goal.strategies[0];
strategy.measures.slice(0, 3).forEach((m, i) => {
  console.log(`  Measure ${i}: owner='${m.owner}'`);
});

// 收集所有的 owners
console.log('\n📊 所有不同的 owner 值:');
const ownerSet = new Set();

// 從 activities
if (dept.activities && dept.activities.length > 0) {
  dept.activities.forEach(act => {
    if (act.owner) ownerSet.add(act.owner);
  });
}

// 從 measures
for (const period of dept.periods) {
  for (const goal of period.ogsm.goals) {
    for (const strategy of goal.strategies) {
      for (const measure of strategy.measures) {
        if (measure.owner) ownerSet.add(measure.owner);
      }
    }
  }
}

console.log('Unique owners:', Array.from(ownerSet).sort());

// 檢查 workspace 中的 teams
console.log('\n📌 workspace.teams:');
if (data.teams) {
  data.teams.forEach(t => {
    console.log(`  Team: id='${t.id}', name='${t.name}'`);
  });
}
