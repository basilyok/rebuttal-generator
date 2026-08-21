// Simplified Chinese — a translation of en.ts, which stays the source of truth.
//
// Register: 你, not 您. This is one thoughtful adult talking to another, not a bank
// talking to a customer. 您 would make every screen feel like enterprise software,
// which is exactly what CONSTITUTION.md tells us not to sound like.
//
// Placeholders like {name} are copied verbatim; only the words around them move.
// Several values keep a leading or trailing space because they concatenate with
// other strings or with a link in the JSX.

const zh_Hans = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': '写一封真能让对方改变想法的回复',
  'app.updateAvailable': '🎉 有新版本了！',
  'app.reload': '重新加载',

  // --- account ---------------------------------------------------------------
  'account.signIn': '登录',
  'account.signInBlurb': '登录之后，你的 API 密钥和语言设置会在各台设备上通用。',
  'account.signOut': '退出登录',
  'account.signedInAs': '已登录：{name}',
  'account.menu': '账户',
  'account.keysSynced': '密钥已同步',
  'account.keysLocked': '密钥已锁定',
  'account.unlock': '解锁',
  'account.unlockTitle': '解锁你保存的密钥',
  'account.unlockBlurb':
    '你的密钥是用一句口令加密的，这句口令从不离开你的设备——连我们也读不到里面是什么。在这台设备上输一次就好。',
  'account.passphrase': '口令',
  'account.passphrasePlaceholder': '你的保险箱口令',
  'account.unlockAction': '解锁',
  'account.wrongPassphrase': '这句口令没能解开你的密钥，再试一次。',
  'account.setupTitle': '让密钥在各台设备上通用',
  'account.setupBlurb':
    '想一句口令。你的 API 密钥会先在这个浏览器里用它加密，然后才上传，所以服务器上存着的始终是一串它自己也读不懂的乱码。',
  'account.setupWarning':
    '这句口令没有任何找回的办法。万一忘了，重新输一遍 API 密钥就行——除此之外什么都不会丢。',
  'account.confirmPassphrase': '再输一遍口令',
  'account.passphraseMismatch': '两次输入的口令不一样。',
  'account.passphraseShort': '至少用 12 个字符——太短的口令别人可以在离线状态下慢慢猜出来。',
  'account.passphraseLettersOnly': '加一个数字或符号，会更难被猜到。',
  'account.saveKeys': '加密并保存',
  'account.forgetKeys': '删除已保存的密钥',
  'account.forgetKeysConfirm': '把服务器上加密保存的密钥删掉？这个浏览器里的密钥会留着。',
  'account.notNow': '暂时不用',
  'account.syncing': '正在保存…',
  'account.vaultSaved': '你的密钥已经加密保存好了。',
  'account.signInOrUp': '登录 / 注册',
  'account.benefitsTitle': '为什么要登录？',
  'account.benefitsKeys': '你的 API 密钥会跟着你到任何一台设备——加密过，只有你自己读得到。',
  'account.benefitsHistory': '你的回复历史也会同步，用同样的方式加密封存。',
  'account.benefitsQuota': '每天 6 次免费的即时回复，而不是 3 次。',
  'account.benefitsLanguage': '你选的语言会跟着账户走，在哪里登录都一样。',
  'account.signUpTitle': '创建你的账户',
  'account.signInTitle': '登录',
  'account.continueWithGoogle': '用 Google 继续',
  'account.orDivider': '或',
  'account.username': '用户名',
  'account.usernamePlaceholder': '3–32 个字符：字母、数字、- 或 _',
  'account.password': '密码',
  'account.confirmPassword': '再输一遍密码',
  'account.emailOptional': '邮箱（可选）',
  'account.noEmailWarning':
    '不填邮箱的话，万一哪天忘了这个密码，就再也没有办法登进来了——没有任何东西可以用来重置。把它抄在一个稳妥的地方。',
  'account.createAccount': '创建账户',
  'account.signInAction': '登录',
  'account.switchToSignIn': '已经有账户了？直接登录',
  'account.switchToSignUp': '第一次来？创建一个',
  'account.passwordShort': '至少用 10 个字符。',
  'account.passwordMismatch': '两次输入的密码不一样。',
  'account.usernameInvalid': '用户名要 3–32 个字符：字母、数字、- 或 _。',
  'account.usernameTaken': '这个用户名已经有人用了——换一个试试。',
  'account.badCredentials': '这个用户名和密码对不上。',
  'account.rateLimited': '试的次数太多了——等几分钟再试。',
  'account.emailInvalid': '这个邮箱地址看起来不太对。',
  'account.serverError': '我们这边出了点问题。请过一会儿再试一次。',
  'account.signOutFirst':
    '这是另一个账户。为了不让两个账户混在一起，这台设备已经退出登录，本机上的历史记录也已清空——重新登录就可以继续。',
  'account.authError': '登录没有完成，请再试一次。',

  // --- recovery --------------------------------------------------------------
  'recovery.title': '你的恢复码',
  'recovery.blurb': '如果你忘记了密码，这串恢复码就是找回已保存的 API 密钥和历史记录的途径。它只显示这一次，请把它存到以后还能找到的地方——密码管理器，或者纸上。',
  'recovery.regenerateHint': '只要处于登录状态，你随时可以生成新的恢复码，所以弄丢一串只是麻烦，不是灾难。',
  'recovery.copy': '复制恢复码',
  'recovery.copied': '已复制',
  'recovery.warning': '如果密码和这串恢复码都丢了，已保存的 API 密钥和历史记录就再也无法恢复——我们也做不到。',
  'recovery.confirm': '我已经把这串恢复码存到安全的地方了',
  'recovery.done': '完成',
  'recovery.working': '正在设置…',
  'recovery.setupFailed': '现在没能设置恢复码，请再试一次；如果一直这样，请重新登录。',
  'recovery.promptBody': '你还没有恢复码。没有它，一旦忘记密码，已保存的密钥和历史记录就会永久丢失。',
  'recovery.promptAction': '设置恢复码',
  'recovery.promptDismiss': '暂时不用',
  'recovery.statusNone': '设置恢复码',
  'recovery.statusFinishing': '恢复设置未完成 · 去完成',
  'recovery.statusReady': '恢复已就绪 · 换一串新码',
  'recovery.statusUnknown': '恢复状态未知 · 换一串新码',
  'recovery.statusStale': '恢复代码可能已失效 · 新代码',
  'recovery.resetTitle': '重置密码',
  'recovery.resetIntro': '输入你的用户名和保存好的恢复码。',
  'recovery.codeLabel': '恢复码',
  'recovery.newPassword': '新密码',
  'recovery.resetAction': '重置密码',
  'recovery.resetContinue': '继续',
  'recovery.resetBack': '返回',
  'recovery.resetWorking': '正在重置…',
  'recovery.resetFailed': '用户名和恢复码对不上。',
  'recovery.resetCorrupt':
    '存储的恢复记录已损坏，无法打开。重新输入代码也无济于事。',
  'recovery.resetInterrupted':
    '重置被中断了。请试着用你刚设置的新密码登录：能登录说明重置已经完成；不能登录，则原来的密码仍然有效。无论哪种情况，之后都请生成一个新的恢复代码。',
  'recovery.resetBlocked': '这个账户的恢复设置还没完成。先用密码登录一次，把它设置好。',
  'recovery.forgot': '忘记密码了？',
  'recovery.leaveConfirm': '恢复码还在屏幕上，而且不会再显示。要不保存就离开吗？',
  'recovery.replacesOld': '这会替换掉之前的恢复码——旧的那串从现在起失效。',
  'recovery.rotateConfirm': '要生成新的恢复码吗？现在这串会立即失效，你需要重新保存新的。',
  'recovery.promptLostBody': '你有恢复码，但这台设备从未确认过你把它存好。如果它在你记下来之前就丢了，就没法用它找回账户。你可以现在换一串新的。',
  'recovery.promptLostAction': '生成新的恢复码',

  // --- language --------------------------------------------------------------
  'language.label': '语言',
  'language.switchToEnglish': 'English',
  'language.choose': '选择语言',
  'language.followDevice': '跟随设备语言',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': '选一个模型',
  'settings.hide': '收起',
  'settings.change': '更改',
  'settings.provider': 'AI 提供方',
  'settings.model': '模型',
  'settings.refresh': '↻ 刷新',
  'settings.refreshing': '正在刷新…',
  'settings.refreshTitle': '获取这家提供方当前的模型列表',
  'settings.useShortList': '用精简列表',
  'settings.useShortListTitle': '回到那份手工挑选的精简列表',
  'settings.modelsUpdated': '{count} 个模型 · 更新于 {date}',
  'settings.apiKeyLabel': '{provider} API 密钥',
  'settings.apiKeyPlaceholder': '输入你的 API 密钥',
  'settings.saveKey': '保存密钥',
  'settings.cancel': '取消',
  'settings.changeKey': '更换 API 密钥',
  'settings.keyHelpFree':
    '这家提供方即使是免费模型也要一个 API 密钥，不过申请是免费的，不用填任何付款信息。 ',
  'settings.keyHelpPaid':
    '密钥只存在这个浏览器里，也只会发给这家提供方。你不用再输第二次。 ',
  'settings.keyHelpSynced':
    '密钥会在这台设备上加密，然后同步到你的账户，所以在任何一台设备上都不用再输一次。 ',
  'settings.getOneFrom': '可以去这里申请：',
  'settings.preferNoKey': '完全不想用密钥？在 AI 提供方的下拉菜单里选 {option}。',
  'settings.localOption': '浏览器本地运行（免费，不用密钥）',
  'settings.tavilyLabel': '证据搜索密钥',
  'settings.optional': '可选',
  'settings.save': '保存',
  'settings.saved': '✓ 已保存',
  'settings.tavilyHelp':
    '证据搜索一个密钥都不填也照样能用。免费的 {link} 密钥（每月 1,000 次搜索，不用绑卡）只是在你真的搜到上限时把额度抬高一些。',
  'settings.costPerReply': '每封回复约 {cost}',
  'settings.costIncludesReasoning': '每封回复约 {cost}（含看不见的推理 token）',
  'settings.costFreeLocal': '免费——在你自己的设备上运行，不产生任何费用',
  'settings.costUnknown': '这个模型的价格不详',
  'settings.costFreeModel': '免费模型——不收费',

  // --- input -----------------------------------------------------------------
  'input.label': '你要回应的是什么？',
  'input.modeGroup': '输入方式',
  'input.modeText': '✍️ 说出来或打字',
  'input.modeUrl': '🔗 文章链接',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': '抓取文章',
  'input.fetching': '正在抓取…',
  'input.startRecording': '🎙 开始录音',
  'input.stopRecording': '⏹ 停止录音',
  'input.recording': '正在录音…',
  'input.clear': '清空',
  'input.placeholderText': '把对方的说法打在这里，或者点“开始录音”直接说出来…',
  'input.placeholderUrl': '抓到的文章正文会出现在这里——生成之前你可以随手改。',
  'input.articleWords': '{count} 个词',
  'input.articleViaArchive': ' · 读取自 Internet Archive 的存档快照',
  'input.articleTruncated': ' · 已截短，好让请求保持精简',

  // --- audience --------------------------------------------------------------
  'audience.label': '这是谁写的，写在哪里？',
  'audience.optional': '可选——但它会改变这封回复的写法',
  'audience.placeholder': '例如：我岳父，在微信上 · LinkedIn 上的一个陌生人',
  'audience.help':
    '空着也行，程序会从文本里推测。写清楚对方是谁，回复就能引用他们本来就信得过的来源，也能贴近他们平时说话的样子。',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': '将用{language}回复',
  'replyLang.change': '更改',
  'replyLang.label': '回复用这门语言写',
  'replyLang.help': '这封回复是写给提出说法的那个人看的，所以它跟着对方的语言走，而不是跟着界面语言。',
  'replyLang.auto': '跟着原文走（{language}）',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': '去找真实的证据来引用',
  'sources.hint':
    ' —— 会先上网搜，回复只能引用真正搜到的东西。所有模型都能用，不需要密钥。',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ 帮我写回复',
  'generate.working': '正在写…',
  'generate.searching': '正在搜证据…',
  'generate.writing': '正在写这封回复…',
  'generate.srStatus': '正在生成回复',

  // --- reply -----------------------------------------------------------------
  'reply.title': '你的回复',
  'reply.copy': '📋 复制这段话',
  'reply.copied': '✓ 已复制',
  'reply.sourcesCited': '引用了 {count} 个来源',
  'reply.sourcesCitedOne': '引用了 1 个来源',
  'reply.noSources': '没有引用来源',
  'reply.linksRemoved': ' · 已移除 {count} 个无法核实的链接',
  'reply.linksRemovedOne': ' · 已移除 1 个无法核实的链接',
  'reply.toCheck': ' · 有 {count} 处要核对',
  'reply.claimWarn':
    '模型给出了 {count} 个链接，并不在真正检索到的来源里。它们已经被删掉，而不是摆在你面前——编造出来的出处比没有出处更糟。',
  'reply.claimWarnOne':
    '模型给出了 1 个链接，并不在真正检索到的来源里。它已经被删掉，而不是摆在你面前——编造出来的出处比没有出处更糟。',
  'reply.checkBeforeSending': '发出去之前先核对',
  'reply.noSourcesRetrieved':
    '这封回复没有检索到任何来源。里面的每一句事实性说法都未经核实——凡是你打算靠它站住脚的，先自己查一下。',
  'reply.sourcesTitle': '来源',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ 发出去之前——你这一方最弱的地方',
  'briefing.title': '对方最有力的说法——以及你在哪里回应了它',
  'briefing.tag': '仅供你自己看——别发给对方',
  'briefing.building': '正在把对方最有力的说法整理出来…',
  'briefing.answered': '你的回复回应了吗？',
  'briefing.unused': '搜到了，但没用上',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 生成一个分享链接',
  'share.creating': '正在生成链接…',
  'share.copyLink': '复制链接',
  'share.caveat': '会把这段论点和回复发布出去，拿到链接的人都读得到',
  'share.help':
    '拿到这个链接的人都能读到那段论点和这封回复。它不会被搜索收录，也没法被翻找到——但它并不是私密的。链接一年后失效。',
  'share.banner': '有人把这封回复分享给了你',
  'share.generatedWith': '由 {model} 生成',
  'share.generatedWithAI': '由 AI 生成',
  'share.theArgument': '原本的说法',
  'share.theReply': '这封回复',
  'share.steelmanHeading': '支持这个说法的最强理由',
  'share.from': '来自',
  'share.writeYourOwn': '✍️ 写一封你自己的回复',
  'share.startFresh': '重新开始',

  // --- cost ------------------------------------------------------------------
  'cost.actual': '花费：',
  'cost.tokens': '（输入 {in} / 输出 {out}）',
  'cost.tokensWithReasoning': '（输入 {in} / 输出 {out}，推理 {reasoning}）',
  'cost.sessionTotal': ' · 本次一共 {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': '先把你想回应的那段话放进来',
  'error.needModel': '请选一个模型',
  'error.needKey': '请输入一个有效的 API 密钥',
  'error.needKeyForModels': '先输入你的 API 密钥——模型列表要向提供方去取。',
  'error.timeout': '请求超时了，请再试一次。',
  'error.generic': '没能写出这封回复',
  'error.refreshModels': '没能刷新模型列表',
  'error.briefing': '没能整理出对方的说法。',
  'error.publish': '没能发布这封回复。',
  'error.loadShared': '这个分享出来的回复打不开。',
  'error.article': '这篇文章加载不了。把正文直接粘贴进来试试。',
  'error.searchUnavailable': '证据搜索这会儿用不了。',
  'error.speechUnsupported': '这个浏览器不支持语音识别。请换用 Chrome、Edge 或 Safari。',
  'error.micDenied': '麦克风权限被拒绝了。请允许本站使用麦克风，然后再试一次。',
  'error.micMissing': '没有找到麦克风。检查一下麦克风是不是接好了，然后再试一次。',
  'error.speechNetwork': '语音服务遇到了网络错误。检查一下网络连接，然后再试一次。',

  // --- instant mode ----------------------------------------------------------
  'instant.working': '正在写你的回复（不需要密钥）…',
  'instant.left': '今天还剩 {n} 次免费回复',
  'instant.leftOne': '今天还剩 1 次免费回复',
  'instant.done.title': '今天的免费回复用完了',
  'instant.done.body':
    '{time} 会恢复。登录可以拿到更大的每日额度，或者输入你自己的 API 密钥，回复不设上限，也完全不经过我们的服务器。',
  'instant.done.byok': '改用我自己的 API 密钥',
  'instant.turnstile': '验证失败——刷新页面，然后再试一次。',
  'instant.error': '即时模式这会儿用不了——过一会儿再试，或者用你自己的 API 密钥。',
  'instant.badge': '即时模式',

  // --- history ---------------------------------------------------------------
  'history.show': '历史记录',
  'history.hide': '收起历史记录',
  'history.empty': '还没有保存的回复——你生成的每一封回复都会保存在这里，就在这台设备上。',
  'history.localOnly': '只保存在这台设备上。登录并解锁你的保险箱，就能让它加密同步到其他设备。',
  'history.synced': '已加密同步到你的账户。只有你自己的设备才能读到它。',
  'history.delete': '删除这条记录',
  'history.clear': '清空所有历史记录',
  'history.clearConfirm': '删除所有保存的回复？同步的那份副本也会一起清空。这个操作无法撤销。',
}

export default zh_Hans
