const scenarios = [
  {
    name: "現行",
    enemyHp: (time) => 18 + Math.floor(time / 23) * 4,
    primaryDamage: (tier) => 12 + (tier - 1) * 7,
    spawnInterval: (time) => Math.max(0.12, 0.68 - Math.min(0.74, time / 140)),
    batch: (time) => 1 + Math.floor(Math.min(3, time / 48)),
  },
  {
    name: "調整案",
    enemyHp: (time) => 14 + Math.floor(time / 25) * 4,
    primaryDamage: (tier) => 14 + (tier - 1) * 8,
    spawnInterval: (time) => Math.max(0.6, 0.9 - time / 150),
    batch: (time) => (time >= 100 ? 2 : 1),
  },
];

const checkpoints = [0, 20, 40, 60, 100, 140];
for (const scenario of scenarios) {
  console.log(`\n${scenario.name}`);
  console.log("time hp T1_hits T2_hits enemies_per_min");
  for (const time of checkpoints) {
    const hp = scenario.enemyHp(time);
    const tierOneHits = Math.ceil(hp / scenario.primaryDamage(1));
    const tierTwoHits = Math.ceil(hp / scenario.primaryDamage(2));
    const perMinute = (scenario.batch(time) * 60 / scenario.spawnInterval(time)).toFixed(1);
    console.log(`${time.toString().padStart(4)} ${hp.toString().padStart(2)} ${tierOneHits.toString().padStart(7)} ${tierTwoHits.toString().padStart(7)} ${perMinute.toString().padStart(14)}`);
  }
}
