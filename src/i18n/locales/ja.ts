// Japanese — a translation of locales/en.ts.
//
// Register: です・ます, plain and warm. One adult writing to another adult they
// respect — not 敬語 for a customer, not corporate software. Pronouns are dropped
// wherever Japanese would drop them; 「あなた」 only where the UI genuinely needs
// to distinguish the user from the person they are replying to.
//
// Leading/trailing spaces are kept exactly as in en.ts because several of these
// strings are concatenated with a link or another string at render time.

const ja = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': '相手の考えが本当に変わる返信を書く',
  'app.updateAvailable': '🎉 新しいバージョンが出ました！',
  'app.reload': '再読み込み',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'ログイン',
  'account.signInBlurb': 'ログインしておくと、API キーと言語の設定をどの端末でも使えます。',
  'account.signOut': 'ログアウト',
  'account.signedInAs': '{name} でログイン中',
  'account.menu': 'アカウント',
  'account.keysSynced': 'キーを同期済み',
  'account.keysLocked': 'キーはロック中',
  'account.unlock': 'ロックを解除',
  'account.unlockTitle': '保存したキーのロックを解除',
  'account.unlockBlurb':
    'キーはパスフレーズで暗号化されています。パスフレーズがこの端末から出ることはないので、私たちにも中身は読めません。この端末では一度入力するだけです。',
  'account.passphrase': 'パスフレーズ',
  'account.passphrasePlaceholder': '保管庫のパスフレーズ',
  'account.unlockAction': 'ロックを解除',
  'account.wrongPassphrase': 'そのパスフレーズではキーを開けませんでした。もう一度入力してみてください。',
  'account.setupTitle': 'キーを保存して、どの端末でも使う',
  'account.setupBlurb':
    'パスフレーズ（自分だけが知っている長めの合言葉）を決めてください。API キーはアップロードされる前にこのブラウザの中で暗号化されるので、サーバーに残るのは中身の読めない文字列だけです。',
  'account.setupWarning':
    'このパスフレーズを復元する方法はありません。忘れてしまったときは、API キーを入力し直すだけです。ほかに失われるものはありません。',
  'account.confirmPassphrase': 'パスフレーズを再入力',
  'account.passphraseMismatch': '2 つのパスフレーズが一致しません。',
  'account.passphraseShort': '12 文字以上にしてください。短いパスフレーズは、時間をかければ手元で当てられてしまいます。',
  'account.passphraseLettersOnly': '数字か記号を足すと、ぐっと推測されにくくなります。',
  'account.saveKeys': '暗号化して保存',
  'account.forgetKeys': '保存したキーを削除',
  'account.forgetKeysConfirm': '暗号化されたキーをサーバーから削除しますか？このブラウザのキーはそのまま残ります。',
  'account.notNow': '今はしない',
  'account.syncing': '保存中…',
  'account.vaultSaved': 'キーを暗号化して保存しました。',
  'account.signInOrUp': 'ログイン / 新規登録',
  'account.benefitsTitle': 'ログインしておくといいこと',
  'account.benefitsKeys': 'API キーがどの端末にもついてきます。暗号化されているので、読めるのはあなただけです。',
  'account.benefitsHistory': '返信の履歴も、同じように暗号化されて同期されます。',
  'account.benefitsQuota': 'インスタントモードの無料の返信が、1 日 3 回から 6 回に増えます。',
  'account.benefitsLanguage': '選んだ言語が、ログインしたどの端末でもそのまま使われます。',
  'account.signUpTitle': 'アカウントの作成',
  'account.signInTitle': 'ログイン',
  'account.continueWithGoogle': 'Google で続ける',
  'account.orDivider': 'または',
  'account.username': 'ユーザー名',
  'account.usernamePlaceholder': '英字、数字、- か _ で 3–32 文字',
  'account.password': 'パスワード',
  'account.confirmPassword': 'パスワードを再入力',
  'account.emailOptional': 'メールアドレス（任意）',
  'account.noEmailWarning':
    'メールアドレスがないと、このパスワードを忘れたときに戻る方法がありません。リセットに使えるものが何もないからです。安全な場所に書き留めておいてください。',
  'account.createAccount': 'アカウントを作成',
  'account.signInAction': 'ログイン',
  'account.switchToSignIn': 'すでにアカウントがありますか？ログイン',
  'account.switchToSignUp': 'はじめてですか？アカウントを作成',
  'account.passwordShort': '10 文字以上にしてください。',
  'account.passwordMismatch': '2 つのパスワードが一致しません。',
  'account.usernameInvalid': 'ユーザー名は 3–32 文字で、使えるのは英字、数字、- か _ です。',
  'account.usernameTaken': 'そのユーザー名はすでに使われています。別の名前を試してみてください。',
  'account.badCredentials': 'そのユーザー名とパスワードは一致しませんでした。',
  'account.rateLimited': '試行回数が多すぎます。1 分ほど待ってから、もう一度お試しください。',
  'account.emailInvalid': 'そのメールアドレスは正しくないようです。',
  'account.serverError': 'こちら側で問題が起きました。少し待ってから、もう一度お試しください。',
  'account.signOutFirst':
    'それは別のアカウントです。アカウントを分けておくため、この端末をログアウトし、この端末に残っていた履歴も消去しました。続けるには、もう一度ログインしてください。',
  'account.authError': 'ログインが完了しませんでした。もう一度お試しください。',

  // --- language --------------------------------------------------------------
  'language.label': '言語',
  'language.switchToEnglish': 'English',
  'language.choose': '言語を選ぶ',
  'language.followDevice': '端末の設定に合わせる',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'モデルを選ぶ',
  'settings.hide': '隠す',
  'settings.change': '変更',
  'settings.provider': 'AI プロバイダー',
  'settings.model': 'モデル',
  'settings.refresh': '↻ 更新',
  'settings.refreshing': '更新中…',
  'settings.refreshTitle': 'プロバイダーの最新のモデル一覧を取得します',
  'settings.useShortList': '短い一覧に戻す',
  'settings.useShortListTitle': '厳選した短い一覧に戻します',
  'settings.modelsUpdated': 'モデル {count} 件 · {date} 更新',
  'settings.apiKeyLabel': '{provider} の API キー',
  'settings.apiKeyPlaceholder': 'API キーを入力',
  'settings.saveKey': 'キーを保存',
  'settings.cancel': 'キャンセル',
  'settings.changeKey': 'API キーを変更',
  'settings.keyHelpFree':
    'このプロバイダーは無料モデルでも API キーが必要ですが、キーを作ること自体は無料で、支払い情報も要りません。 ',
  'settings.keyHelpPaid':
    'キーはこのブラウザだけに保存され、送られる先もこのプロバイダーだけです。次からは入力しなくて済みます。 ',
  'settings.keyHelpSynced':
    'キーはこの端末で暗号化してからアカウントに同期されるので、どの端末でも入力し直す必要はありません。 ',
  'settings.getOneFrom': 'キーの取得先：',
  'settings.preferNoKey': 'キーを使いたくないときは、AI プロバイダーの一覧から「{option}」を選んでください。',
  'settings.localOption': 'ブラウザ内でローカル実行（無料・キー不要）',
  'settings.tavilyLabel': '根拠検索用のキー',
  'settings.optional': '任意',
  'settings.save': '保存',
  'settings.saved': '✓ 保存しました',
  'settings.tavilyHelp':
    '根拠の検索はキーがなくても動きます。無料の {link} キー（月 1,000 回、カード不要）は、回数の上限に当たったときに枠を広げるためのものです。',
  'settings.costPerReply': '返信 1 通あたり約 {cost}',
  'settings.costIncludesReasoning': '返信 1 通あたり約 {cost}（表に出ない推論トークンを含む）',
  'settings.costFreeLocal': '無料 — 端末の中で動くので、料金はかかりません',
  'settings.costUnknown': 'このモデルの料金は不明です',
  'settings.costFreeModel': '無料モデル — 料金はかかりません',

  // --- input -----------------------------------------------------------------
  'input.label': '何に返信しますか？',
  'input.modeGroup': '入力方法',
  'input.modeText': '✍️ 話す・入力する',
  'input.modeUrl': '🔗 記事の URL',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': '記事を読み込む',
  'input.fetching': '読み込み中…',
  'input.startRecording': '🎙 録音を開始',
  'input.stopRecording': '⏹ 録音を停止',
  'input.recording': '録音中…',
  'input.clear': 'クリア',
  'input.placeholderText': '相手の主張をここに入力するか、「録音を開始」で話して入力します…',
  'input.placeholderUrl': '読み込むと記事の本文がここに出ます。作成する前に手を入れられます。',
  'input.articleWords': '{count} 語',
  'input.articleViaArchive': ' · Internet Archive の保存版から読み込みました',
  'input.articleTruncated': ' · リクエストを軽くするため一部を省きました',

  // --- audience --------------------------------------------------------------
  'audience.label': '書いたのは誰で、どこでの話ですか？',
  'audience.optional': '任意 — ただし、これで書き方が変わります',
  'audience.placeholder': '例：義理の父に、メッセージで · LinkedIn の知らない人',
  'audience.help':
    '空欄のままなら本文から推測します。相手がどんな人か書いておくと、その人がもともと信頼している情報源を使い、話し方も相手に合わせられます。',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': '{language}で返信します',
  'replyLang.change': '変更',
  'replyLang.label': '返信を書く言語',
  'replyLang.help': '返信は主張を書いた本人に届くものなので、画面の言語ではなく相手の言語に合わせます。',
  'replyLang.auto': '相手の主張に合わせる（{language}）',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': '引用できる本物の根拠を探す',
  'sources.hint':
    ' — 先にウェブを検索して、実際に見つかったものしか引用しません。どのモデルでも使えて、キーも要りません。',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ 返信を書く',
  'generate.working': '作成中…',
  'generate.searching': '根拠を検索中…',
  'generate.writing': '返信を作成中…',
  'generate.srStatus': '反論を作成しています',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'あなたの返信',
  'reply.copy': '📋 メッセージをコピー',
  'reply.copied': '✓ コピーしました',
  'reply.sourcesCited': '出典 {count} 件を引用',
  'reply.sourcesCitedOne': '出典 1 件を引用',
  'reply.noSources': '引用した出典はありません',
  'reply.linksRemoved': ' · 未確認のリンクを {count} 件削除しました',
  'reply.linksRemovedOne': ' · 未確認のリンクを 1 件削除しました',
  'reply.toCheck': ' · うち {count} 件は要確認',
  'reply.claimWarn':
    '実際に取得できた出典に含まれないリンクを、モデルが {count} 件出しました。存在しない出典を示すのは出典なしより悪いので、表示せずに削除しました。',
  'reply.claimWarnOne':
    '実際に取得できた出典に含まれないリンクを、モデルが 1 件出しました。存在しない出典を示すのは出典なしより悪いので、表示せずに削除しました。',
  'reply.checkBeforeSending': '送る前に確認',
  'reply.noSourcesRetrieved':
    'この返信では出典を 1 件も取得できませんでした。事実にあたる部分はどれも未確認です。よりどころにするつもりのところは、自分で確かめてください。',
  'reply.sourcesTitle': '出典',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ 送る前に — あなたの主張の弱いところ',
  'briefing.title': '相手の最強の言い分と、それにどこで答えているか',
  'briefing.tag': '自分用 — 相手には送らないでください',
  'briefing.building': '相手の最強の言い分を組み立て中…',
  'briefing.answered': 'あなたの返信は、これに答えられていますか？',
  'briefing.unused': '取得したが使わなかったもの',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 共有リンクを作る',
  'share.creating': 'リンクを作成中…',
  'share.copyLink': 'リンクをコピー',
  'share.caveat': 'この主張と反論を公開し、リンクを知っている人なら誰でも読めるようにします',
  'share.help':
    'このリンクを知っている人は、主張と反論を読めます。検索にも一覧にも出ませんが、非公開ではありません。リンクは 1 年で使えなくなります。',
  'share.banner': '誰かがこの返信をあなたに共有しました',
  'share.generatedWith': '{model} で作成',
  'share.generatedWithAI': 'AI で作成',
  'share.theArgument': '相手の主張',
  'share.theReply': '返信',
  'share.steelmanHeading': 'この主張を支持する側の、いちばん強い言い分',
  'share.from': '掲載元：',
  'share.writeYourOwn': '✍️ 自分の返信を書く',
  'share.startFresh': '最初からやり直す',

  // --- cost ------------------------------------------------------------------
  'cost.actual': '料金：',
  'cost.tokens': '（入力 {in} / 出力 {out}）',
  'cost.tokensWithReasoning': '（入力 {in} / 出力 {out}、推論 {reasoning}）',
  'cost.sessionTotal': ' · セッション合計 {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'まず、返信したい主張を入れてください',
  'error.needModel': 'モデルを選んでください',
  'error.needKey': '有効な API キーを入力してください',
  'error.needKeyForModels': '先に API キーを入力してください。モデル一覧はプロバイダーから取ってきます。',
  'error.timeout': 'リクエストがタイムアウトしました。もう一度お試しください。',
  'error.generic': '返信を作成できませんでした',
  'error.refreshModels': 'モデル一覧を更新できませんでした',
  'error.briefing': '相手の言い分を組み立てられませんでした。',
  'error.publish': 'この反論を公開できませんでした。',
  'error.loadShared': '共有された反論を読み込めませんでした。',
  'error.article': 'その記事を読み込めませんでした。本文を貼り付けてみてください。',
  'error.searchUnavailable': '根拠の検索が使えませんでした。',
  'error.speechUnsupported': 'このブラウザは音声認識に対応していません。Chrome、Edge、Safari をお使いください。',
  'error.micDenied': 'マイクの使用が許可されませんでした。このサイトにマイクを許可して、もう一度お試しください。',
  'error.micMissing': 'マイクが見つかりませんでした。マイクがつながっているか確認して、もう一度お試しください。',
  'error.speechNetwork': '音声認識サービスでネットワークエラーが起きました。接続を確認して、もう一度お試しください。',

  // --- instant mode ------------------------------------------------------------
  'instant.working': '返信を作成中（キー不要）…',
  'instant.left': '今日はあと {n} 回、無料で返信を作成できます',
  'instant.leftOne': '今日はあと 1 回、無料で返信を作成できます',
  'instant.done.title': '今日の無料の返信はここまでです',
  'instant.done.body':
    '{time}にまた使えるようになります。ログインすれば 1 日に使える回数が増えますし、自分の API キーを追加すれば、サーバーを経由しない返信を回数無制限で作成できます。',
  'instant.done.byok': '代わりに自分の API キーを使う',
  'instant.turnstile': '確認に失敗しました。ページを再読み込みして、もう一度お試しください。',
  'instant.error': 'インスタントモードは今は使えません。少し待ってからもう一度試すか、自分の API キーを使ってください。',
  'instant.badge': 'インスタントモード',

  // --- history ---------------------------------------------------------------
  'history.show': '履歴',
  'history.hide': '履歴を隠す',
  'history.empty': 'まだ保存された返信はありません — 作成した返信はすべて、この端末に自動で保存されます。',
  'history.localOnly': 'この端末にのみ保存されています。ログインして保管庫のロックを解除すれば、暗号化した状態でどの端末とも同期できます。',
  'history.synced': 'アカウントに暗号化して同期されています。読めるのは、あなたの端末だけです。',
  'history.delete': 'この記録を削除',
  'history.clear': '履歴をすべて削除',
  'history.clearConfirm': '保存した返信をすべて削除しますか？同期されているコピーも削除されます。元に戻すことはできません。',
}

export default ja
