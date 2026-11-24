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
//   desc … 図鑑のポップアップに出す説明文（解放済みのときだけ表示）
//   order … 図鑑での表示順（1〜18）

export const FRUITS = [
  { id: 'strawberry', emoji: '🍓', name: 'イチゴ', color: '#e8384f', light: '#ffd9de',
    desc: 'あかくて、あまずっぱい人気のフルーツ！ 表面についている小さなつぶつぶが、じつは一つひとつ果実なんだよ。',
    unlock: { type: 'default' } },
  { id: 'apple', emoji: '🍎', name: 'リンゴ', color: '#d62b2b', light: '#ffd6d1',
    desc: 'シャキシャキした歯ごたえが楽しいフルーツ。世界には何千種類ものリンゴがあって、色や味もいろいろなんだよ！',
    unlock: { type: 'total', count: 3 } },
  { id: 'orange', emoji: '🍊', name: 'ミカン', color: '#ea7a00', light: '#ffe6c4',
    desc: '手でかんたんに皮をむける、冬に人気のフルーツ！ ビタミンCがふくまれていて、あまずっぱい味がとくちょうだよ。',
    unlock: { type: 'total', count: 7 } },
  { id: 'banana', emoji: '🍌', name: 'バナナ', color: '#d29400', light: '#fff1b3',
    desc: 'あまくて、エネルギーがいっぱいのフルーツ！ じつはバナナの木に見えるものは、木ではなく、とても大きな草のなかまなんだ。',
    unlock: { type: 'total', count: 12 } },
  { id: 'grape', emoji: '🍇', name: 'ブドウ', color: '#7b3fb3', light: '#ead9f7',
    desc: '小さな実が、ふさになって育つフルーツ。むらさき色だけでなく、みどり色や赤色のブドウもあるんだよ！',
    unlock: { type: 'total', count: 20 } },
  { id: 'watermelon', emoji: '🍉', name: 'スイカ', color: '#2e9e4f', light: '#d5f2dc',
    desc: '夏にぴったりの、みずみずしいフルーツ！ じつはキュウリやカボチャと同じ、ウリ科のなかまなんだよ。',
    unlock: { type: 'total', count: 30 } },
  { id: 'cherry', emoji: '🍒', name: 'サクランボ', color: '#c2185b', light: '#fbd5e3',
    desc: '小さくて、赤くて、かわいいフルーツ！ サクラのなかまの木に実がなり、2つがくっついたような形で売られることも多いよ。',
    unlock: { type: 'total', count: 40 } },
  { id: 'peach', emoji: '🍑', name: 'モモ', color: '#ef6c84', light: '#ffe0e6',
    desc: 'やわらかくて、あまい香りがするフルーツ。皮の表面には、うぶ毛のような細かい毛が生えているんだよ！',
    unlock: { type: 'total', count: 50 } },
  { id: 'lemon', emoji: '🍋', name: 'レモン', color: '#c9a400', light: '#fff5bf',
    desc: 'とってもすっぱい、黄色いフルーツ！ さわやかな香りがとくちょうで、ジュースやおかし、料理にも使われるよ。',
    unlock: { type: 'difficulty', level: 2, count: 5 } },
  { id: 'pear', emoji: '🍐', name: 'ナシ', color: '#8aa313', light: '#eef5cc',
    desc: 'シャリシャリした食感と、たっぷりの果汁がとくちょう！ 日本のナシは丸いものが多いけれど、ひょうたん形の洋ナシもあるよ。',
    unlock: { type: 'difficulty', level: 2, count: 15 } },
  { id: 'pineapple', emoji: '🍍', name: 'パイナップル', color: '#c48a00', light: '#fbefb8',
    desc: 'トゲトゲした皮と、あまずっぱい果肉がとくちょう！ じつは、たくさんの小さな花からできた実が集まっているんだよ。',
    unlock: { type: 'difficulty', level: 3, count: 5 } },
  { id: 'kiwi', emoji: '🥝', name: 'キウイ', color: '#5c9a1e', light: '#e2f3cf',
    desc: '茶色い毛のある皮の中に、みどり色や黄色の果肉が入っているよ。名前は、ニュージーランドの鳥「キウイ」にちなんでいるんだ！',
    unlock: { type: 'difficulty', level: 3, count: 15 } },
  { id: 'mango', emoji: '🥭', name: 'マンゴー', color: '#e8700a', light: '#ffe2c2',
    desc: '南のあたたかい地域で育つ、あまくて香りのよいフルーツ！ 黄色やオレンジ色の果肉がとってもジューシーだよ。',
    unlock: { type: 'difficulty', level: 4, count: 5 } },
  { id: 'blueberry', emoji: '🫐', name: 'ブルーベリー', color: '#3f51b5', light: '#dfe3f8',
    desc: '小さくて、青むらさき色のフルーツ！ 果実には「アントシアニン」という色のもとがふくまれているんだよ。',
    unlock: { type: 'difficulty', level: 4, count: 15 } },
  { id: 'coconut', emoji: '🥥', name: 'ココナッツ', color: '#8d6e63', light: '#efe5df',
    desc: 'ヤシの木になる、大きな実だよ！ 中にはココナッツウォーターという液体があり、白い部分はおかしや料理に使われるよ。',
    unlock: { type: 'difficulty', level: 5, count: 10 } },
  { id: 'melon', emoji: '🍈', name: 'メロン', color: '#57a33a', light: '#e2f4d8',
    desc: 'あまくて、よい香りがするフルーツ！ 皮にあみ目もようがある種類もあって、このあみ目は実が育つときにできるんだよ。',
    unlock: { type: 'difficulty', level: 5, count: 20 } },
  { id: 'greenapple', emoji: '🍏', name: '青リンゴ', color: '#5c9e1f', light: '#e4f5d2',
    desc: 'さわやかなみどり色のリンゴだよ！ 赤いリンゴと同じく、シャキシャキした食感が楽しめて、すっぱめの品種も多いんだ。',
    unlock: { type: 'timeattack', count: 2 } },
  { id: 'avocado', emoji: '🥑', name: 'アボカド', color: '#4d7a24', light: '#e6efd6',
    desc: '中に大きなタネがある、みどり色の果実だよ！ あまりあまくないけれど、なめらかな食感で、サラダや料理に大人気なんだ。',
    unlock: { type: 'timeattack', count: 5 } },
].map((f, i) => ({ ...f, order: i + 1 }));

export const DEFAULT_FRUIT_ID = 'strawberry';

export function getFruit(id) {
  return FRUITS.find((f) => f.id === id) || FRUITS[0];
}
