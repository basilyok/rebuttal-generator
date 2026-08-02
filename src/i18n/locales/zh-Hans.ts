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
  'account.signInWithGoogle': '用 Google 登录',
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
  'instant.done.signIn': '用 Google 登录',
  'instant.done.byok': '改用我自己的 API 密钥',
  'instant.turnstile': '验证失败——刷新页面，然后再试一次。',
  'instant.error': '即时模式这会儿用不了——过一会儿再试，或者用你自己的 API 密钥。',
  'instant.badge': '即时模式',
}

export default zh_Hans
