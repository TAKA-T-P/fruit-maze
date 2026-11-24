// フルーツの定義（全 18 種類）。盤面全体に「選んだ 1 種類」を表示する。
// 種類・順番・解放条件は第4段階の確定仕様。既存の 9 種類の ID は第1段階から変えていない。
//
//   color … ルートの線・通ったマスの枠の色（クリーム色の盤面で見やすい濃さ）
//   light … 通ったマスの背景色
//   unlock … 解放条件
//     { type: 'default' }                     最初から使える
//     { type: 'total', count }                ぜんぶの難易度で、ちがうステージを count こクリア
//     { type: 'difficulty', level, count }    ★level のちがうステージを count こクリア
//     { type: 'timeattack', count }           タイムアタックを count このむずかしさで、最後まで あそんだ（途中でやめた挑戦は数えない）
//   order … 図鑑での表示順（1〜18）

export const FRUITS = [
  { id: 'strawberry', emoji: '🍓', name: 'イチゴ', color: '#e8384f', light: '#ffd9de', unlock: { type: 'default' } },
  { id: 'apple', emoji: '🍎', name: 'リンゴ', color: '#d62b2b', light: '#ffd6d1', unlock: { type: 'total', count: 3 } },
  { id: 'orange', emoji: '🍊', name: 'ミカン', color: '#ea7a00', light: '#ffe6c4', unlock: { type: 'total', count: 7 } },
  { id: 'banana', emoji: '🍌', name: 'バナナ', color: '#d29400', light: '#fff1b3', unlock: { type: 'total', count: 12 } },
  { id: 'grape', emoji: '🍇', name: 'ブドウ', color: '#7b3fb3', light: '#ead9f7', unlock: { type: 'total', count: 20 } },
  { id: 'watermelon', emoji: '🍉', name: 'スイカ', color: '#2e9e4f', light: '#d5f2dc', unlock: { type: 'total', count: 30 } },
  { id: 'cherry', emoji: '🍒', name: 'サクランボ', color: '#c2185b', light: '#fbd5e3', unlock: { type: 'total', count: 40 } },
  { id: 'peach', emoji: '🍑', name: 'モモ', color: '#ef6c84', light: '#ffe0e6', unlock: { type: 'total', count: 50 } },
  { id: 'lemon', emoji: '🍋', name: 'レモン', color: '#c9a400', light: '#fff5bf', unlock: { type: 'difficulty', level: 2, count: 5 } },
  { id: 'pear', emoji: '🍐', name: 'ナシ', color: '#8aa313', light: '#eef5cc', unlock: { type: 'difficulty', level: 2, count: 15 } },
  { id: 'pineapple', emoji: '🍍', name: 'パイナップル', color: '#c48a00', light: '#fbefb8', unlock: { type: 'difficulty', level: 3, count: 5 } },
  { id: 'kiwi', emoji: '🥝', name: 'キウイ', color: '#5c9a1e', light: '#e2f3cf', unlock: { type: 'difficulty', level: 3, count: 15 } },
  { id: 'mango', emoji: '🥭', name: 'マンゴー', color: '#e8700a', light: '#ffe2c2', unlock: { type: 'difficulty', level: 4, count: 5 } },
  { id: 'blueberry', emoji: '🫐', name: 'ブルーベリー', color: '#3f51b5', light: '#dfe3f8', unlock: { type: 'difficulty', level: 4, count: 15 } },
  { id: 'coconut', emoji: '🥥', name: 'ココナッツ', color: '#8d6e63', light: '#efe5df', unlock: { type: 'difficulty', level: 5, count: 10 } },
  { id: 'melon', emoji: '🍈', name: 'メロン', color: '#57a33a', light: '#e2f4d8', unlock: { type: 'difficulty', level: 5, count: 20 } },
  { id: 'greenapple', emoji: '🍏', name: '青リンゴ', color: '#5c9e1f', light: '#e4f5d2', unlock: { type: 'timeattack', count: 2 } },
  { id: 'avocado', emoji: '🥑', name: 'アボカド', color: '#4d7a24', light: '#e6efd6', unlock: { type: 'timeattack', count: 5 } },
].map((f, i) => ({ ...f, order: i + 1 }));

export const DEFAULT_FRUIT_ID = 'strawberry';

export function getFruit(id) {
  return FRUITS.find((f) => f.id === id) || FRUITS[0];
}
