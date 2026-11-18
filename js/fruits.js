// フルーツの定義。盤面全体に「選んだ 1 種類」を表示する。
// 第1段階はイチゴ固定。解放条件・図鑑は第4段階で実装する（unlocked はその時に保存データから決める）。
// color / light は盤面の色（ルート線・通過済みマスの背景）に使う。

export const FRUITS = [
  { id: 'strawberry', emoji: '🍓', name: 'イチゴ', color: '#e8384f', light: '#ffd9de' },
  { id: 'apple', emoji: '🍎', name: 'リンゴ', color: '#d62b2b', light: '#ffd6d1' },
  { id: 'orange', emoji: '🍊', name: 'ミカン', color: '#f08a12', light: '#ffe6c4' },
  { id: 'banana', emoji: '🍌', name: 'バナナ', color: '#d9a800', light: '#fff1b3' },
  { id: 'grape', emoji: '🍇', name: 'ブドウ', color: '#7b3fb3', light: '#ead9f7' },
  { id: 'watermelon', emoji: '🍉', name: 'スイカ', color: '#2e9e4f', light: '#d5f2dc' },
  { id: 'pineapple', emoji: '🍍', name: 'パイナップル', color: '#c99a00', light: '#fbefb8' },
  { id: 'peach', emoji: '🍑', name: 'モモ', color: '#f0708a', light: '#ffe0e6' },
  { id: 'kiwi', emoji: '🥝', name: 'キウイ', color: '#5c9a1e', light: '#e2f3cf' },
];

export const DEFAULT_FRUIT_ID = 'strawberry';

export function getFruit(id) {
  return FRUITS.find((f) => f.id === id) || FRUITS[0];
}
