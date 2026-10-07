# Paseo Cache Countdown

Paseoのcomposeエリア上のpillに、プロンプトキャッシュの残り時間と円形プログレスバーを表示するプラグインです。

| エージェント | 有効時間 | 黄色になる残り時間 | 赤色になる残り時間 |
| --- | --- | --- | --- |
| Codex | 30分 | 15分以下 | 3分45秒以下 |
| Claude Code（メイン会話） | 1時間 | 30分以下 | 7分30秒以下 |
| Claude Code（サブエージェント） | 5分 | 2分30秒以下 | 37.5秒以下 |

Claude Codeの有効時間は、[Claude Codeのプロンプトキャッシュに関するドキュメント](https://code.claude.com/docs/ja/prompt-caching)のClaudeサブスクリプション（プラン使用量内）の値に従います。別のPaseoエージェントから委譲されたエージェント（`paseo.parent-agent-id` ラベルを持つもの）をサブエージェントとして扱います。課金方法は判別できないため、使用クレジット・APIキー・クラウドプロバイダーを使う場合はメイン会話も5分となり、1時間の目安は当てはまりません。

通常は緑色、残り時間が半分以下になると黄色、1/8以下になると赤色に変化します。色にはPaseoテーマの `statusSuccess` / `statusWarning` / `statusDanger` を使用します。期限切れ後は赤色のリングと `Cache 00:00` を表示します。

残り時間は壁時計の時刻から毎秒再計算します。**新しいユーザー／アシスタントのメッセージ、ストリーミングchunk、ツールの完了・失敗をクライアントが受信した時点でリセットします。** その活動のdaemon側の時刻とクライアントの受信時刻を対応付け、リモートホストと端末の時計差を補正します。ツールは `tool_call` の `completed` / `failed` イベントでのみリセットし、呼び出し開始・実行中の出力・キャンセルではリセットしません。推論やタイトル変更なども対象外です。表示は秒単位で切り上げるため、Claude Codeサブエージェントの赤色への切り替えは `00:38` 表示中に起きます。

並列ツールも、それぞれの完了・失敗イベントで更新します。例えばAが先に完了するとAの結果の受信時にリセットし、その後Bが完了するとBの結果の受信時に再リセットします。イベントの順序はdaemon側の時刻で判定するため、遅れて届いた古い結果や同じ結果の再通知では、カウントダウンも時計差の補正値も更新しません。同じ会話を開き直した場合もこの判定を引き継ぎます。並列グループ全体の完了や、全結果をまとめてAPIへ送信した瞬間を検出するものではありません。

会話を開いた際にメッセージとツール結果の履歴を取得し、再接続時にも再同期します。Paseo 0.10.3の公開プラグインAPIにはdaemonの現在時刻を取得する機能がないため、最初のライブ活動を受信する前の履歴表示は、daemonとクライアントの時計が一致している前提です。ライブ活動の受信後は履歴にも時計差の補正を適用し、会話のpillが登録されている間は補正値を保持します。読み込み失敗時は間隔を延ばしながら最大30秒間隔で再試行します。対象履歴がない場合、初回の履歴読み込み中、取得失敗時は `Cache --:--` を表示します。pillを押すと、最終更新時刻と状態を確認できます。PaseoのプラグインAPIはアプリの言語設定を提供しないため、プラグインのUIテキストは英語のみです。Codex / Claude Code以外のproviderには表示しません。

これは指定された30分／1時間／5分を使う目安で、プロバイダー側の実際のキャッシュ保持状態やAPIへの送信時刻を照会するものではありません。受信時刻で時計差を補正するため、ライブ活動の目安には配送遅延も含まれます。

## セッション一覧

複数のセッションのカウントダウンをまとめて一覧表示することもできます。

- **サイドバーの画面**: サイドバーの **Cache Countdown** を選択すると、ホスト上のすべてのCodex / Claude Codeセッションを、プロジェクト・ワークスペースごとに新しい順で表示します。複数のホストにインストールしている場合は、Paseoのホスト選択で選んだホストのセッションを表示します。
- **ワークスペースパネル**: ワークスペースまたはExplorerの新規タブメニューから **Cache Countdown** を選択すると、そのワークスペースのセッションを表示します。

行を押すとその会話を開きます。Paseo 0.10.3のプラグインAPIでは、サイドバーにある標準のセッション行へ表示を追加できないため、別の一覧として表示します。一覧の目安・色・`Cache --:--` になる条件はpillと同じで、残り時間のみを表示します。一覧を開いている間は表示中のすべてのセッションの履歴を読み込んで追跡し、一覧とpillを閉じると購読を停止します。

## 設定

**Settings → Plugins → paseo-cache-countdown → Display** の **Show “Cache” in the pill** をオフにすると、pillには `Cache 29:59` ではなく `29:59` のように残り時間のみを表示します。デフォルトは表示です。設定はホストに保存され、そのホストに接続するすべてのクライアントで共有されます。会話を開いた直後は、設定の読み込みが終わるまで既定の表示になることがあります。

## インストール

Paseo **0.10.3以上**のdaemonとクライアントが必要です。

1. 対象ホストの **Settings → Plugins → Enable plugins** をオンにします。
2. **Plugin source** に `github:mohemohe/paseo-cache-countdown` を入力し、**Install plugin** を選択します。

CLIからもインストールできます。

```sh
paseo plugin install github:mohemohe/paseo-cache-countdown
paseo plugin ls
```

編集後は再読み込みします。

```sh
paseo plugin reload paseo-cache-countdown
```

カウントダウンはクライアントのみで動作します。サーバー側エントリは、Paseoが設定をホストに保存するための設定ドキュメントを登録するだけです。APIキーや外部サービスは不要です。React / React Native / SDKはPaseoが提供します。

## 開発・検証

```sh
npm ci
npm run check
npm run preview
```

`http://127.0.0.1:4173/preview/` で実際の円形プログレスコンポーネントを確認できます。Codex / Claude Code（メイン会話・サブエージェント）、残り50%、1/8、期限切れ、新規メッセージを切り替えられます。サイドバーの画面とワークスペースパネルのセッション一覧も、サンプルのセッションで確認できます。このプレビューは表示確認用で、Paseoには接続しません。

自動テストは期間と色の境界、リモートの時計の遅れ・進み、スリープ相当の時計の進み、ツールの完了・失敗による更新と開始・キャンセルの除外、並列ツールの完了順・遅延・重複、履歴取得範囲の拡大、履歴と新着イベントの競合、再接続、履歴置換、再マウント、会話ごとの登録・解除、セッション一覧へのセッション名の公開とワークスペースごとのグループ化、`Cache` 表示設定とその既定値を検証します。実際のPaseo画面では、インストール後に対象会話を開き、メッセージ送受信とツールの完了・失敗でタイマーがリセットされることを確認してください。

開発依存はPaseo 0.10.3のReact / React Nativeに合わせています。2026-10-04の `npm audit` では、React Nativeの開発用依存ツリーに含まれる `braces` の指摘が残っています。プラグインの実行用バンドルにこの依存は含まれません。

## 構成

- `index.client.tsx`: クライアント側のプラグインエントリ。設定画面・サイドバーの画面・ワークスペースパネルの登録
- `index.server.ts`: ホストへの設定の保存
- `shared/preferences.ts`: 設定ドキュメントの定義
- `client/register.ts`: 会話ごとのpill登録・解除と、セッション一覧への公開
- `client/sessions.ts`: セッション一覧用の登録済みセッションとワークスペースごとのグループ化
- `client/session-list.tsx`, `client/session-screens.tsx`: セッション一覧の行、サイドバーの画面、ワークスペースパネル
- `client/message-clock.ts`: メッセージ・ツール結果の履歴とライブ更新
- `client/activity-clock.ts`: daemon側のイベント順序とクライアントの時計差の補正
- `client/countdown.ts`: 期間・残り時間・色の計算
- `client/countdown-store.ts`: 表示中だけ時刻の購読と毎秒更新
- `client/pill.tsx`, `client/circle-progress.tsx`: React Nativeのpillアイコン・詳細表示
- `client/settings-screen.tsx`: 設定画面

公式仕様: [Plugin quickstart](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/index.md)、[Composer pills](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#composer-pills)、[Surfaces and sidebar items](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#surfaces-and-sidebar-items)、[Workspace panels](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#workspace-panels)、[Settings screens](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#settings-screens)、[SDK events](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/events.md)。
