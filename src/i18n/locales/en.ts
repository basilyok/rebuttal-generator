// English — the source of truth. Every other locale is a translation of this file,
// and any key missing from a translation falls back to the value here.
//
// TRANSLATOR NOTES
// - `{name}` placeholders must survive verbatim; the surrounding words may move.
// - Product and provider names (Rebuttal Generator, Claude, Gemini, Tavily,
//   OpenRouter, Groq, DeepSeek, Google) stay in English.
// - Keep the register plain and warm. This app is about persuading one person, and
//   the interface should not sound like enterprise software.

const en: Record<string, string> = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'Write the reply that actually changes their mind',
  'app.updateAvailable': '🎉 A new version is available!',
  'app.reload': 'Reload',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'Sign in',
  'account.signInWithGoogle': 'Sign in with Google',
  'account.signInBlurb': 'Sign in to keep your API keys and language across devices.',
  'account.signOut': 'Sign out',
  'account.signedInAs': 'Signed in as {name}',
  'account.menu': 'Account',
  'account.keysSynced': 'Keys synced',
  'account.keysLocked': 'Keys locked',
  'account.unlock': 'Unlock',
  'account.unlockTitle': 'Unlock your saved keys',
  'account.unlockBlurb':
    'Your keys are encrypted with a passphrase that never leaves your device — not even we can read them. Enter it once on this device.',
  'account.passphrase': 'Passphrase',
  'account.passphrasePlaceholder': 'Your vault passphrase',
  'account.unlockAction': 'Unlock',
  'account.wrongPassphrase': 'That passphrase did not unlock your keys. Try again.',
  'account.setupTitle': 'Save your keys across devices',
  'account.setupBlurb':
    'Pick a passphrase. Your API keys are encrypted with it in this browser before they are uploaded, so the server only ever stores scrambled text it cannot read.',
  'account.setupWarning':
    'There is no way to recover this passphrase. If you forget it, you simply re-enter your API keys — nothing else is lost.',
  'account.confirmPassphrase': 'Confirm passphrase',
  'account.passphraseMismatch': 'The two passphrases do not match.',
  'account.passphraseShort': 'Use at least 12 characters — a short passphrase can be guessed offline.',
  'account.passphraseLettersOnly': 'Add a number or symbol to make this harder to guess.',
  'account.saveKeys': 'Encrypt and save',
  'account.forgetKeys': 'Delete saved keys',
  'account.forgetKeysConfirm': 'Delete your encrypted keys from the server? Your keys stay in this browser.',
  'account.notNow': 'Not now',
  'account.syncing': 'Saving…',
  'account.vaultSaved': 'Your keys are encrypted and saved.',

  // --- language --------------------------------------------------------------
  'language.label': 'Language',
  'language.switchToEnglish': 'English',
  'language.choose': 'Choose language',
  'language.followDevice': 'Match my device',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'Choose a model',
  'settings.hide': 'Hide',
  'settings.change': 'Change',
  'settings.provider': 'AI Provider',
  'settings.model': 'Model',
  'settings.refresh': '↻ Refresh',
  'settings.refreshing': 'Refreshing…',
  'settings.refreshTitle': "Fetch the provider's current model list",
  'settings.useShortList': 'use the short list',
  'settings.useShortListTitle': 'Go back to the short, hand-picked list',
  'settings.modelsUpdated': '{count} models · updated {date}',
  'settings.apiKeyLabel': '{provider} API Key',
  'settings.apiKeyPlaceholder': 'Enter your API key',
  'settings.saveKey': 'Save Key',
  'settings.cancel': 'Cancel',
  'settings.changeKey': 'Change API Key',
  'settings.keyHelpFree':
    'This provider needs an API key even for its free models, but creating one is free — no payment details required. ',
  'settings.keyHelpPaid':
    'Your key is saved in this browser only, and sent only to this provider. You will not need to enter it again. ',
  'settings.keyHelpSynced':
    'Your key is encrypted on this device and synced to your account, so you will not need to enter it again on any device. ',
  'settings.getOneFrom': 'Get one from',
  'settings.preferNoKey': 'Prefer no key at all? Pick {option} in the AI Provider dropdown.',
  'settings.localOption': 'Local in-browser (FREE, no key)',
  'settings.tavilyLabel': 'Evidence search key',
  'settings.optional': 'optional',
  'settings.save': 'Save',
  'settings.saved': '✓ Saved',
  'settings.tavilyHelp':
    'Evidence search already works with no key at all. A free {link} key (1,000 searches a month, no card) only raises the rate limit if you hit it.',
  'settings.costPerReply': '≈ {cost} per reply',
  'settings.costIncludesReasoning': '≈ {cost} per reply (includes hidden reasoning tokens)',
  'settings.costFreeLocal': 'Free — runs on your device, nothing is billed',
  'settings.costUnknown': 'Pricing unknown for this model',
  'settings.costFreeModel': 'Free model — no charge',

  // --- input -----------------------------------------------------------------
  'input.label': 'What are you responding to?',
  'input.modeGroup': 'Input mode',
  'input.modeText': '✍️ Speak or type',
  'input.modeUrl': '🔗 Article URL',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': 'Fetch article',
  'input.fetching': 'Fetching…',
  'input.startRecording': '🎙 Start Recording',
  'input.stopRecording': '⏹ Stop Recording',
  'input.recording': 'Recording…',
  'input.clear': 'Clear',
  'input.placeholderText': 'Type the argument here, or use Start Recording to dictate it…',
  'input.placeholderUrl': 'The article text will appear here once fetched — you can edit it before generating.',
  'input.articleWords': '{count} words',
  'input.articleViaArchive': ' · read from an Internet Archive snapshot',
  'input.articleTruncated': ' · trimmed to keep the request small',

  // --- audience --------------------------------------------------------------
  'audience.label': 'Who wrote it, and where?',
  'audience.optional': 'optional — but it changes how this is written',
  'audience.placeholder': 'e.g. my father-in-law, over text · a stranger on LinkedIn',
  'audience.help':
    'Leave it blank and this gets inferred from the text. Saying who they are lets the reply use sources they already trust and match how they actually talk.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'Replying in {language}',
  'replyLang.change': 'change',
  'replyLang.label': 'Write the reply in',
  'replyLang.help': 'The reply goes to the person who wrote the argument, so it follows their language, not the interface language.',
  'replyLang.auto': 'Match the argument ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'Find real evidence to cite',
  'sources.hint':
    ' — searches the web first, and the reply may only cite what was actually found. Works on every model, no key needed.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ Write my reply',
  'generate.working': 'Writing…',
  'generate.searching': 'Searching for evidence…',
  'generate.writing': 'Writing the reply…',
  'generate.srStatus': 'Generating rebuttal',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'Your reply',
  'reply.copy': '📋 Copy message',
  'reply.copied': '✓ Copied',
  'reply.sourcesCited': '{count} sources cited',
  'reply.sourcesCitedOne': '1 source cited',
  'reply.noSources': 'No sources cited',
  'reply.linksRemoved': ' · {count} unverified links removed',
  'reply.linksRemovedOne': ' · 1 unverified link removed',
  'reply.toCheck': ' · {count} to check',
  'reply.claimWarn':
    'The model produced {count} links that were not among the sources actually retrieved. They were removed rather than shown to you, because an invented citation is worse than none.',
  'reply.claimWarnOne':
    'The model produced 1 link that was not among the sources actually retrieved. It was removed rather than shown to you, because an invented citation is worse than none.',
  'reply.checkBeforeSending': 'Check before sending',
  'reply.noSourcesRetrieved':
    'No sources were retrieved for this reply. Every factual claim in it is unverified — check anything you plan to lean on.',
  'reply.sourcesTitle': 'Sources',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ Before you send — the weak point in your position',
  'briefing.title': 'Their best case — and where you answer it',
  'briefing.tag': 'for you — don’t send',
  'briefing.building': 'Building their strongest case…',
  'briefing.answered': 'Does your reply answer it?',
  'briefing.unused': 'Retrieved but not used',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 Get a shareable link',
  'share.creating': 'Creating link…',
  'share.copyLink': 'Copy link',
  'share.caveat': 'Publishes this argument and rebuttal so anyone with the link can read them',
  'share.help':
    'Anyone with this link can read the argument and the rebuttal. It is unlisted — not indexed and not browsable — but it is not private. Links expire after a year.',
  'share.banner': 'Someone shared this reply with you',
  'share.generatedWith': 'Generated with {model}',
  'share.generatedWithAI': 'Generated with AI',
  'share.theArgument': 'The argument',
  'share.theReply': 'The reply',
  'share.steelmanHeading': 'The strongest case FOR the argument',
  'share.from': 'From',
  'share.writeYourOwn': '✍️ Write your own reply',
  'share.startFresh': 'Start fresh',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'Cost:',
  'cost.tokens': '({in} in / {out} out)',
  'cost.tokensWithReasoning': '({in} in / {out} out, {reasoning} reasoning)',
  'cost.sessionTotal': ' · session total {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'Add the argument you want to respond to first',
  'error.needModel': 'Please choose a model',
  'error.needKey': 'Please enter a valid API key',
  'error.needKeyForModels': 'Enter your API key first — the model list comes from the provider.',
  'error.timeout': 'The request timed out. Please try again.',
  'error.generic': 'Could not write the reply',
  'error.refreshModels': 'Could not refresh the model list',
  'error.briefing': 'Could not build their case.',
  'error.publish': 'Could not publish this rebuttal.',
  'error.loadShared': 'That shared rebuttal could not be loaded.',
  'error.article': 'Could not load that article. Try pasting the text instead.',
  'error.searchUnavailable': 'Evidence search was unavailable.',
  'error.speechUnsupported': 'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.',
  'error.micDenied': 'Microphone access was denied. Allow microphone access for this site and try again.',
  'error.micMissing': 'No microphone was found. Check that a microphone is connected and try again.',
  'error.speechNetwork': 'The speech service hit a network error. Check your connection and try again.',
}

export default en
