/**
 * Amberline Cataclysm: HUD contract for a tactical 3D survival arena.
 * Game modules remain React-free; this file is the narrow visual state boundary.
 */

export type GamePhase = "playing" | "upgrade" | "gameover";

export type StandardUpgradeId = "pulse" | "scatter" | "orbit" | "relay" | "barrier";
export type ModuleId = "vector" | "nova" | "mirage" | "pylon" | "reactive" | "cryo" | "ricochet" | "gravity" | "decoy" | "mortar" | "split" | "boomerang" | "laser" | "chain" | "mine" | "fan" | "skyfall" | "cleaver" | "needle" | "saw" | "harpoon" | "thermal" | "sonic" | "cluster" | "corrosion";
export type UpgradeId = StandardUpgradeId | ModuleId;
export type AttackId = "rail" | "scatter" | "orbit" | ModuleId;
export type IconId = AttackId | "pulse" | "relay" | "barrier";

export interface AttackStatus {
  id: AttackId;
  label: string;
  detail: string;
  iconId: IconId;
  tier: number;
  active: boolean;
}

export interface UpgradeOption {
  id: UpgradeId;
  code: string;
  title: string;
  description: string;
  iconId: IconId;
  category: "standard" | "module";
}

export interface GameSnapshot {
  phase: GamePhase;
  health: number;
  maxHealth: number;
  damageFlash: number;
  xp: number;
  xpNeeded: number;
  level: number;
  kills: number;
  seconds: number;
  weaponTier: number;
  weaponCount: number;
  weaponLimit: number;
  rerollsRemaining: number;
  enemyCount: number;
  debugStatus?: string;
  attacks: AttackStatus[];
  upgrades: UpgradeOption[];
}

export const STANDARD_UPGRADES: UpgradeOption[] = [
  { id: "pulse", code: "WPN-01", title: "レール増幅器", description: "主砲の出力を上げ、自動追尾ボルトを強化する。", iconId: "pulse", category: "standard" },
  { id: "scatter", code: "WPN-24", title: "散弾アレイ", description: "近距離を薙ぎ払う三連散弾を追加または強化する。", iconId: "scatter", category: "standard" },
  { id: "orbit", code: "WPN-52", title: "周回センチネル", description: "接近する敵を切り払う周回センチネルを追加または強化する。", iconId: "orbit", category: "standard" },
  { id: "relay", code: "SYS-24", title: "フラックス中継機", description: "射撃間隔と移動機構を最適化する。", iconId: "relay", category: "standard" },
  { id: "barrier", code: "DEF-09", title: "防壁コア", description: "装甲を再構成し、耐久値を回復する。", iconId: "barrier", category: "standard" },
];

export const MODULE_UPGRADES: UpgradeOption[] = [
  { id: "vector", code: "MOD-10", title: "ベクターランス", description: "最寄り敵を貫く高出力の槍弾を展開する。", iconId: "vector", category: "module" },
  { id: "nova", code: "MOD-14", title: "ノヴァリング", description: "周囲を掃討する全周衝撃波を展開する。", iconId: "nova", category: "module" },
  { id: "mirage", code: "MOD-21", title: "ミラージュドローン", description: "追尾射撃を行う幻影ドローンを増設する。", iconId: "mirage", category: "module" },
  { id: "pylon", code: "MOD-27", title: "セントリーパイロン", description: "短命の自動砲台を戦場へ設置する。", iconId: "pylon", category: "module" },
  { id: "reactive", code: "MOD-33", title: "リアクティブ装甲", description: "被弾を軽減し、周囲へ反撃波を放つ。", iconId: "reactive", category: "module" },
  { id: "cryo", code: "MOD-41", title: "クライオロック", description: "攻撃命中時に敵を減速・凍結させる。", iconId: "cryo", category: "module" },
  { id: "ricochet", code: "MOD-46", title: "跳弾バースト", description: "敵群の間を跳ね回る高密度の跳弾を射出する。", iconId: "ricochet", category: "module" },
  { id: "gravity", code: "MOD-54", title: "特異点弾", description: "敵を引き寄せて圧壊する重力コアを展開する。", iconId: "gravity", category: "module" },
  { id: "decoy", code: "MOD-63", title: "デコイビーコン", description: "敵を誘導し、最終的に爆発する囮ビーコンを設置する。", iconId: "decoy", category: "module" },
  { id: "mortar", code: "MOD-68", title: "迫撃アーク", description: "敵群の奥へ曲射弾を撃ち込み、着弾地点を爆破する。", iconId: "mortar", category: "module" },
  { id: "split", code: "MOD-72", title: "プリズム分裂", description: "命中後に分裂し、周囲の敵へ追撃弾を放つ。", iconId: "split", category: "module" },
  { id: "boomerang", code: "MOD-79", title: "リターンブレード", description: "敵を切り裂きながら往復する回収ブレードを放つ。", iconId: "boomerang", category: "module" },
  { id: "laser", code: "MOD-83", title: "イオンランス", description: "最寄りの敵群を一直線に焼き切る貫通レーザーを放つ。", iconId: "laser", category: "module" },
  { id: "chain", code: "MOD-88", title: "アーク連鎖", description: "敵から敵へ伝播する高圧電撃連鎖を解き放つ。", iconId: "chain", category: "module" },
  { id: "mine", code: "MOD-94", title: "近接地雷", description: "敵が近づくと爆発する近接地雷を設置する。", iconId: "mine", category: "module" },
  { id: "fan", code: "MOD-97", title: "プリズム扇撃", description: "最寄りの敵群へ扇状に分岐する短射程ビームを掃射する。", iconId: "fan", category: "module" },
  { id: "skyfall", code: "MOD-101", title: "スカイフォール標識", description: "敵の密集地点へ上空から高出力の落雷を投下する。", iconId: "skyfall", category: "module" },
  { id: "cleaver", code: "MOD-106", title: "位相クリーヴァー", description: "敵群を横切る位相斬撃で広い射線を薙ぎ払う。", iconId: "cleaver", category: "module" },
  { id: "needle", code: "MOD-110", title: "ニードルレイン", description: "周囲の敵群へ高密度の針弾を降り注がせる。", iconId: "needle", category: "module" },
  { id: "saw", code: "MOD-114", title: "ソーハロ", description: "周囲を周回する回転鋸で接近する敵を切り刻む。", iconId: "saw", category: "module" },
  { id: "harpoon", code: "MOD-119", title: "チェーンハープーン", description: "最寄りの敵を貫き、拘束して手前へ引き寄せる。", iconId: "harpoon", category: "module" },
  { id: "thermal", code: "MOD-123", title: "サーマルアーク", description: "熱線を敵群へ連鎖させ、最終点で過熱爆発を起こす。", iconId: "thermal", category: "module" },
  { id: "sonic", code: "MOD-127", title: "ソニックブレイカー", description: "前方扇形へ衝撃音波を放ち、敵群を押し返す。", iconId: "sonic", category: "module" },
  { id: "cluster", code: "MOD-132", title: "クラスターコア", description: "命中後に追尾子弾へ分裂する高密度コアを放つ。", iconId: "cluster", category: "module" },
  { id: "corrosion", code: "MOD-137", title: "腐食刻印", description: "命中した敵を腐食させ、継続ダメージと弱体化を蓄積する。", iconId: "corrosion", category: "module" },
];

export const UPGRADE_CATALOG: UpgradeOption[] = [...STANDARD_UPGRADES, ...MODULE_UPGRADES];
