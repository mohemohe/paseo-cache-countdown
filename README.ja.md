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

- **サイドバーの画面**: サイドバーの **Cache Countdown** を選択すると、アプリに登録されたオンラインの全ホストのCodex / Claude Codeセッションを、プロジェクト・ワークスペースごとに新しい順で表示します。複数のホストのセッションがある場合は、見出しの先頭にホスト名を表示します。ほかのホストにプラグインをインストールする必要はなく、そのセッションは画面を開いている間だけ購読します。

  一覧の上のコントロールで、絞り込みと並べ替えができます。
  - **Host**: すべてのホスト（**All**）か、オンラインのホスト1つを選びます。1つを選ぶと、ほかのホストの購読を停止します。
  - **検索**: 入力した文字列をタイトル・プロジェクト名・ワークスペース名に含むセッションだけを表示します。大文字と小文字は区別しません。
  - **Sort**: **Host & project** はホスト・プロジェクト・ワークスペースの見出しごとにまとめます。**Time remaining** は有効なキャッシュを残り時間の短い順に並べ、その後に期限切れ（`00:00`）、不明（`--:--`）を表示します。各行にはホスト・プロジェクト・ワークスペースを表示し、カウントダウンに合わせて順序を更新します。

  画面を閉じると絞り込みは元に戻ります。
- **ワークスペースパネル**: ワークスペースまたはExplorerの新規タブメニューから **Cache Countdown** を選択すると、そのワークスペースのセッションを表示します。

Paseoのサイドバーと同様に、アーカイブ済みのセッションと、アーカイブ済みのワークスペース・プロジェクトにあるセッションは表示しません。行を押すとその会話を開きます。Paseo 0.10.3のプラグインAPIでは、サイドバーにある標準のセッション行へ表示を追加できないため、別の一覧として表示します。一覧の目安・色・`Cache --:--` になる条件はpillと同じで、残り時間のみを表示します。一覧を開いている間は表示中のすべてのセッションの履歴を読み込んで追跡し、一覧とpillを閉じると購読を停止します。

## 設定

**Settings → Plugins → paseo-cache-countdown → Display** の **Show “Cache” in the pill** をオフにすると、pillには `Cache 29:59` ではなく `29:59` のように残り時間のみを表示します。デフォルトは表示です。設定はホストに保存され、そのホストに接続するすべてのクライアントで共有されます。会話を開いた直後は、設定の読み込みが終わるまで既定の表示になることがあります。

## アラート

**Settings → Plugins → paseo-cache-countdown → Alerts** で、目安が黄色・赤色になったときにシェルコマンドを実行できます。音を鳴らしたり、システム通知を出したりする用途を想定しています。Codex、Claude Code（メイン会話）、Claude Code（サブエージェント）のそれぞれに、上の表の残り時間で実行する黄色と赤色のセクションがあります。各セクションには **Run commands** スイッチ（デフォルトはオフ）があり、コマンドをいくつでも登録できます。**Add** でコマンドを追加し、**Save** で保存します。コマンドを空にして保存すると削除されます。同じセクションのコマンドは一覧の順に起動し、前のコマンドの終了は待ちません。設定はホストに保存され、そのホストに接続するすべてのクライアントで共有されます。

daemonはターンの終了時に計測を始め、次のターンの開始時やエージェントのアーカイブ時に止めます。そのため、Paseoの画面を開いていなくてもアラートを実行します。pillは最後のメッセージやツール結果を起点にしますが、アラートはターンの終了時を起点にするため、pillの色が変わるより少し遅れて実行されることがあります。ターンの実行中はアラートを実行しません。daemonの再起動やプラグインの再読み込みで待機中のアラートは消えるため、その時点ですでに待機中だったセッションは、次にターンが終わるまでアラートの対象になりません。

コマンドは**daemonが動いているマシン**のシステムシェル（macOS / Linuxでは `/bin/sh`）で実行します。スマートフォンなど別の端末やリモートホストに接続したクライアントからPaseoを使っている場合、音は手元の端末ではなくdaemonのマシンで鳴ります。このホストのプラグイン設定を変更できる人は、daemonのマシンでコマンドを実行できます。コマンドはdaemonの環境変数を引き継ぎます。起動失敗や0以外の終了コードはdaemonのログに記録され、プラグインの再読み込みや無効化の時点で実行中のコマンドは停止します。

macOSでの例:

```sh
afplay /System/Library/Sounds/Glass.aiff
osascript -e "display notification \"$PASEO_CACHE_REMAINING left\" with title \"$PASEO_CACHE_PROFILE_NAME prompt cache\""
```

各コマンドには次の環境変数を追加します。

| 変数 | 値 |
| --- | --- |
| `PASEO_CACHE_PROVIDER` | エージェントのprovider。`codex` または `claude` |
| `PASEO_CACHE_PROFILE` | カウントダウンの種類。`codex`、`claude`、`claude-subagent` のいずれか |
| `PASEO_CACHE_PROFILE_NAME` | 表示名。`Codex`、`Claude Code`、`Claude Code (subagent)` のいずれか |
| `PASEO_CACHE_LEVEL` | `warning`（黄色）または `danger`（赤色） |
| `PASEO_CACHE_REMAINING` | `15:00` のような `mm:ss` 形式の残り時間 |
| `PASEO_CACHE_REMAINING_SECONDS` | 秒単位で切り上げた残り時間（例: `900`） |
| `PASEO_CACHE_DURATION_SECONDS` | キャッシュの有効時間（秒）。`1800`、`3600`、`300` のいずれか |
| `PASEO_CACHE_EXPIRES_AT` | ISO 8601（UTC）形式の有効期限の目安（例: `2026-10-07T00:30:00.000Z`） |
| `PASEO_AGENT_ID` | エージェントID |
| `PASEO_AGENT_TITLE` | エージェントのタイトル。ない場合は空文字列 |
| `PASEO_WORKSPACE_ID` | ワークスペースID |
| `PASEO_AGENT_CWD` | エージェントの作業ディレクトリ |

設定画面にも同じ変数の一覧を表示します（英語）。

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

pillとセッション一覧はクライアントで動作します。サーバー側エントリは、Paseoが設定をホストに保存するための設定ドキュメントを登録し、daemonのマシンでアラートのコマンドを実行します。APIキーや外部サービスは不要です。React / React Native / SDKはPaseoが提供します。

## 開発・検証

```sh
npm ci
npm run check
npm run preview
```

`http://127.0.0.1:4173/preview/` で実際の円形プログレスコンポーネントを確認できます。Codex / Claude Code（メイン会話・サブエージェント）、残り50%、1/8、期限切れ、新規メッセージを切り替えられます。サイドバーの画面のセッション一覧（ホスト選択・検索・並べ替えも操作可能）とワークスペースパネルも、サンプルのセッションで確認できます。このプレビューは表示確認用で、Paseoには接続しません。

自動テストは期間と色の境界、リモートの時計の遅れ・進み、スリープ相当の時計の進み、ツールの完了・失敗による更新と開始・キャンセルの除外、並列ツールの完了順・遅延・重複、履歴取得範囲の拡大、履歴と新着イベントの競合、再接続、履歴置換、再マウント、会話ごとの登録・解除、セッション一覧へのセッション名の公開、ほかのホストの購読、ホスト・ワークスペースごとのグループ化、検索、残り時間順の並べ替え、`Cache` 表示設定とその既定値、種類と色ごとのアラートのタイミング、色ごとのスイッチとコマンド、アラートの環境変数、新しいターン・アーカイブ・終了処理による取り消し、シェルコマンドの実行と停止を検証します。実際のPaseo画面では、インストール後に対象会話を開き、メッセージ送受信とツールの完了・失敗でタイマーがリセットされることを確認してください。アラートを試すには、ターン終了から2分30秒で黄色になるClaude Code（サブエージェント）のアラートを有効にすると手早く確認できます。

開発依存はPaseo 0.10.3のReact / React Nativeに合わせています。2026-10-04の `npm audit` では、React Nativeの開発用依存ツリーに含まれる `braces` の指摘が残っています。プラグインの実行用バンドルにこの依存は含まれません。

## 構成

- `index.client.tsx`: クライアント側のプラグインエントリ。設定画面・サイドバーの画面・ワークスペースパネルの登録
- `index.server.ts`: ホストへの設定の保存とアラート用のフック
- `shared/preferences.ts`, `shared/alerts.ts`: 表示設定・アラート設定のドキュメントの定義と、アラートの環境変数
- `shared/cache-profiles.ts`: クライアントとサーバーで共有する有効時間と色の境界
- `server/alerts.ts`, `server/run-command.ts`: ターンのイベントからのアラートのタイミング計算と、daemonのマシンでのシェルコマンド実行
- `client/register.ts`: 会話ごとのpill登録・解除と、セッション一覧への公開
- `client/session-observer.ts`: 1つのホストのエージェント一覧の購読
- `client/sessions.ts`: セッション一覧用の登録済みセッションと、ホスト・ワークスペースごとのグループ化
- `client/session-list.tsx`, `client/session-screens.tsx`: セッション一覧の行と絞り込み、サイドバーの画面、ワークスペースパネル
- `client/message-clock.ts`: メッセージ・ツール結果の履歴とライブ更新
- `client/activity-clock.ts`: daemon側のイベント順序とクライアントの時計差の補正
- `client/countdown.ts`: 期間・残り時間・色の計算
- `client/countdown-store.ts`: 表示中だけ時刻の購読と毎秒更新
- `client/pill.tsx`, `client/circle-progress.tsx`: React Nativeのpillアイコン・詳細表示
- `client/settings-screen.tsx`, `client/alert-settings-screen.tsx`: 表示設定・アラート設定の画面

公式仕様: [Plugin quickstart](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/index.md)、[Lifecycle hooks](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#events)、[Composer pills](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#composer-pills)、[Surfaces and sidebar items](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#surfaces-and-sidebar-items)、[Workspace panels](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#workspace-panels)、[Settings screens](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#settings-screens)、[SDK events](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/events.md)。
