// 한국어 — en.ts의 번역본. 여기에 없는 키는 영어 값으로 표시됩니다.
//
// 번역 원칙
// - `{name}` 형태의 자리표시자는 그대로 두고, 주변 어순만 자연스럽게 바꿉니다.
// - 제품·제공사 이름(Rebuttal Generator, Claude, Gemini, Tavily, OpenRouter,
//   Groq, DeepSeek, Google)은 영어 그대로 둡니다.
// - 말투는 해요체로 통일했습니다. 이 앱은 한 사람의 마음을 움직이는 일을 돕는
//   도구이고, 화면이 업무용 소프트웨어처럼 딱딱하게 들리면 안 됩니다.

const ko = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': '그 사람의 생각을 정말로 바꾸는 답장을 써 보세요',
  'app.updateAvailable': '🎉 새 버전이 나왔어요!',
  'app.reload': '새로고침',

  // --- account ---------------------------------------------------------------
  'account.signIn': '로그인',
  'account.signInBlurb': '로그인하면 API 키와 언어 설정을 여러 기기에서 그대로 쓸 수 있어요.',
  'account.signOut': '로그아웃',
  'account.signedInAs': '{name} 님으로 로그인했어요',
  'account.menu': '계정',
  'account.keysSynced': '키 동기화됨',
  'account.keysLocked': '키 잠김',
  'account.unlock': '잠금 해제',
  'account.unlockTitle': '저장한 키 잠금 해제',
  'account.unlockBlurb':
    '키는 이 기기 밖으로 나가지 않는 암호로 잠겨 있어요. 그래서 저희도 그 내용을 읽을 수 없어요. 이 기기에서 한 번만 입력하면 돼요.',
  'account.passphrase': '암호',
  'account.passphrasePlaceholder': '보관함 암호',
  'account.unlockAction': '잠금 해제',
  'account.wrongPassphrase': '그 암호로는 키가 열리지 않았어요. 다시 시도해 주세요.',
  'account.setupTitle': '여러 기기에 키 저장하기',
  'account.setupBlurb':
    '암호를 하나 정해 주세요. API 키는 올라가기 전에 이 브라우저 안에서 그 암호로 잠기기 때문에, 서버에는 읽을 수 없게 뒤섞인 글자만 남아요.',
  'account.setupWarning':
    '이 암호는 되찾을 방법이 없어요. 잊어버리면 API 키만 다시 입력하면 되고, 그 밖에 없어지는 건 없어요.',
  'account.confirmPassphrase': '암호 확인',
  'account.passphraseMismatch': '두 암호가 서로 달라요.',
  'account.passphraseShort': '12자 이상으로 정해 주세요. 짧은 암호는 오프라인에서 추측당할 수 있어요.',
  'account.passphraseLettersOnly': '숫자나 기호를 하나 넣으면 훨씬 알아내기 어려워져요.',
  'account.saveKeys': '암호화해서 저장',
  'account.forgetKeys': '저장된 키 삭제',
  'account.forgetKeysConfirm': '서버에 있는 암호화된 키를 지울까요? 이 브라우저에 있는 키는 그대로 남아요.',
  'account.notNow': '나중에',
  'account.syncing': '저장 중…',
  'account.vaultSaved': '키를 암호화해서 저장했어요.',
  'account.signInOrUp': '로그인 / 회원가입',
  'account.benefitsTitle': '로그인하면 뭐가 좋나요?',
  'account.benefitsKeys': 'API 키가 어느 기기로든 따라와요 — 암호화되어 있어서 나만 읽을 수 있어요.',
  'account.benefitsHistory': '답장 기록도 같은 방식으로 잠긴 채 함께 동기화돼요.',
  'account.benefitsQuota': '무료 즉시 답장이 하루 3개에서 6개로 늘어나요.',
  'account.benefitsLanguage': '고른 언어가 로그인하는 곳 어디에서나 그대로 유지돼요.',
  'account.signUpTitle': '계정 만들기',
  'account.signInTitle': '로그인',
  'account.continueWithGoogle': 'Google로 계속하기',
  'account.orDivider': '또는',
  'account.username': '사용자 이름',
  'account.usernamePlaceholder': '3–32자: 영문, 숫자, - 또는 _',
  'account.password': '비밀번호',
  'account.confirmPassword': '비밀번호 확인',
  'account.emailOptional': '이메일 (선택)',
  'account.noEmailWarning':
    '이메일이 없으면 이 비밀번호를 잊었을 때 다시 들어올 방법이 없어요 — 재설정에 쓸 수단이 아예 없거든요. 안전한 곳에 적어 두세요.',
  'account.createAccount': '계정 만들기',
  'account.signInAction': '로그인',
  'account.switchToSignIn': '이미 계정이 있나요? 로그인',
  'account.switchToSignUp': '처음인가요? 계정 만들기',
  'account.passwordShort': '10자 이상으로 정해 주세요.',
  'account.passwordMismatch': '두 비밀번호가 서로 달라요.',
  'account.usernameInvalid': '사용자 이름은 3–32자의 영문, 숫자, - 또는 _만 쓸 수 있어요.',
  'account.usernameTaken': '그 사용자 이름은 이미 쓰이고 있어요 — 다른 이름을 골라 주세요.',
  'account.badCredentials': '그 사용자 이름과 비밀번호가 맞지 않았어요.',
  'account.rateLimited': '시도가 너무 많았어요 — 몇 분 기다렸다가 다시 시도해 주세요.',
  'account.emailInvalid': '이메일 주소가 올바르지 않은 것 같아요.',
  'account.serverError': '저희 쪽에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  'account.signOutFirst':
    '다른 계정이에요. 계정이 서로 섞이지 않도록 이 기기를 로그아웃하고 이 기기에 있던 기록을 지웠어요 — 계속하려면 다시 로그인해 주세요.',
  'account.authError': '로그인을 마치지 못했어요. 다시 시도해 주세요.',

  // --- recovery --------------------------------------------------------------
  'recovery.title': '복구 코드',
  'recovery.blurb':
    '이 코드는 비밀번호를 잊었을 때 저장해 둔 API 키와 기록으로 돌아가는 길이에요. 이번 한 번만 보여 주니, 나중에도 찾을 수 있는 곳 — 비밀번호 관리 앱이나 종이 — 에 적어 두세요.',
  'recovery.regenerateHint': '로그인해 있는 동안에는 언제든 새 코드를 만들 수 있어요. 코드를 잃어버려도 번거로울 뿐, 돌이킬 수 없는 일은 아니에요.',
  'recovery.copy': '코드 복사',
  'recovery.copied': '복사했어요',
  'recovery.warning': '비밀번호와 이 코드를 모두 잃어버리면 저장된 API 키와 기록은 누구도 복구할 수 없어요. 저희도 마찬가지예요.',
  'recovery.confirm': '이 코드를 안전한 곳에 저장했어요',
  'recovery.done': '완료',
  'recovery.working': '설정하는 중…',
  'recovery.setupFailed': '지금은 복구 코드를 설정하지 못했어요. 다시 시도하고, 계속 이러면 다시 로그인해 주세요.',
  'recovery.promptBody': '아직 복구 코드가 없어요. 코드가 없으면 비밀번호를 잊는 순간 저장한 키와 기록이 영영 사라져요.',
  'recovery.promptAction': '복구 설정하기',
  'recovery.promptDismiss': '나중에',
  'recovery.statusNone': '복구 설정하기',
  'recovery.statusFinishing': '복구 설정 미완료 · 마무리하기',
  'recovery.statusReady': '복구 준비됨 · 새 코드',
  'recovery.statusUnknown': '복구 상태 확인 안 됨 · 새 코드',
  'recovery.resetTitle': '비밀번호 재설정',
  'recovery.resetIntro': '사용자 이름과 저장해 둔 복구 코드를 입력하세요.',
  'recovery.codeLabel': '복구 코드',
  'recovery.newPassword': '새 비밀번호',
  'recovery.resetAction': '비밀번호 재설정',
  'recovery.resetContinue': '계속',
  'recovery.resetBack': '뒤로',
  'recovery.resetWorking': '재설정 중…',
  'recovery.resetFailed': '사용자 이름과 복구 코드가 맞지 않아요.',
  'recovery.resetCorrupt':
    '저장된 복구 레코드가 손상되어 열 수 없습니다. 코드를 다시 입력해도 해결되지 않습니다.',
  'recovery.resetBlocked': '이 계정은 복구 설정이 아직 끝나지 않았어요. 비밀번호로 한 번 로그인해서 마무리해 주세요.',
  'recovery.forgot': '비밀번호를 잊으셨나요?',
  'recovery.leaveConfirm': '복구 코드가 아직 화면에 있고 다시 표시되지 않아요. 저장하지 않고 나갈까요?',
  'recovery.replacesOld': '이 코드가 이전 코드를 대체해요. 예전 코드는 지금부터 쓸 수 없어요.',
  'recovery.rotateConfirm': '새 복구 코드를 만들까요? 지금 쓰던 코드는 즉시 무효가 되고, 새 코드를 다시 저장해야 해요.',
  'recovery.promptLostBody':
    '복구 코드는 있지만, 이 기기에서 저장을 확인한 적이 없어요. 적어 두기 전에 화면을 놓쳤다면 그 코드로는 계정을 되찾을 수 없어요. 지금 새 코드로 바꿀 수 있어요.',
  'recovery.promptLostAction': '새 코드 만들기',

  // --- language --------------------------------------------------------------
  'language.label': '언어',
  'language.switchToEnglish': 'English',
  'language.choose': '언어 선택',
  'language.followDevice': '기기 설정에 맞추기',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': '모델 고르기',
  'settings.hide': '숨기기',
  'settings.change': '변경',
  'settings.provider': 'AI 제공사',
  'settings.model': '모델',
  'settings.refresh': '↻ 새로고침',
  'settings.refreshing': '새로고침 중…',
  'settings.refreshTitle': '제공사의 최신 모델 목록을 가져와요',
  'settings.useShortList': '간추린 목록 쓰기',
  'settings.useShortListTitle': '직접 고른 짧은 목록으로 돌아가요',
  'settings.modelsUpdated': '모델 {count}개 · {date} 업데이트',
  'settings.apiKeyLabel': '{provider} API 키',
  'settings.apiKeyPlaceholder': 'API 키를 입력하세요',
  'settings.saveKey': '키 저장',
  'settings.cancel': '취소',
  'settings.changeKey': 'API 키 변경',
  'settings.keyHelpFree':
    '이 제공사는 무료 모델을 쓸 때도 API 키가 필요해요. 대신 키를 만드는 건 무료이고 결제 정보도 필요 없어요. ',
  'settings.keyHelpPaid':
    '키는 이 브라우저에만 저장되고, 이 제공사에만 전송돼요. 한 번 넣으면 다시 입력하지 않아도 돼요. ',
  'settings.keyHelpSynced':
    '키는 이 기기에서 암호화된 뒤 계정에 동기화돼요. 그래서 어느 기기에서도 다시 입력하지 않아도 돼요. ',
  'settings.getOneFrom': '키 받는 곳:',
  'settings.preferNoKey': '키를 아예 쓰고 싶지 않다면 AI 제공사 목록에서 {option} 항목을 고르세요.',
  'settings.localOption': '브라우저에서 바로 실행 (무료, 키 없음)',
  'settings.tavilyLabel': '근거 검색 키',
  'settings.optional': '선택',
  'settings.save': '저장',
  'settings.saved': '✓ 저장됨',
  'settings.tavilyHelp':
    '근거 검색은 키가 없어도 이미 잘 돼요. 무료 {link} 키(한 달 1,000회 검색, 카드 필요 없음)는 사용량 한도에 걸릴 때 그 한도를 올려 줄 뿐이에요.',
  'settings.costPerReply': '답장 한 통에 약 {cost}',
  'settings.costIncludesReasoning': '답장 한 통에 약 {cost} (겉으로 보이지 않는 추론 토큰 포함)',
  'settings.costFreeLocal': '무료 — 내 기기에서 돌아가고 요금이 붙지 않아요',
  'settings.costUnknown': '이 모델은 가격을 알 수 없어요',
  'settings.costFreeModel': '무료 모델 — 요금이 없어요',

  // --- input -----------------------------------------------------------------
  'input.label': '어떤 글에 답하려고 하나요?',
  'input.modeGroup': '입력 방식',
  'input.modeText': '✍️ 말하거나 입력하기',
  'input.modeUrl': '🔗 기사 주소',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': '기사 가져오기',
  'input.fetching': '가져오는 중…',
  'input.startRecording': '🎙 녹음 시작',
  'input.stopRecording': '⏹ 녹음 중지',
  'input.recording': '녹음 중…',
  'input.clear': '지우기',
  'input.placeholderText': '여기에 상대의 주장을 입력하거나, 녹음 시작을 눌러 말로 받아쓰세요…',
  'input.placeholderUrl': '기사를 가져오면 본문이 여기에 나타나요. 답장을 쓰기 전에 고칠 수 있어요.',
  'input.articleWords': '{count}단어',
  'input.articleViaArchive': ' · Internet Archive 저장본에서 읽었어요',
  'input.articleTruncated': ' · 요청을 가볍게 하려고 일부를 잘랐어요',

  // --- audience --------------------------------------------------------------
  'audience.label': '누가, 어디에 쓴 글인가요?',
  'audience.optional': '선택 사항 — 하지만 답장의 결이 달라져요',
  'audience.placeholder': '예: 아버님께 문자로 · LinkedIn에서 만난 모르는 사람',
  'audience.help':
    '비워 두면 글을 보고 짐작해요. 상대가 누구인지 알려 주면, 그 사람이 이미 믿고 있는 자료를 쓰고 말투도 그 사람에게 맞출 수 있어요.',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': '{language}(으)로 답장해요',
  'replyLang.change': '변경',
  'replyLang.label': '답장을 쓸 언어',
  'replyLang.help': '답장은 그 글을 쓴 사람에게 가니까, 화면 언어가 아니라 그 사람이 쓴 언어를 따라가요.',
  'replyLang.auto': '원글에 맞추기 ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': '인용할 실제 근거 찾기',
  'sources.hint':
    ' — 먼저 웹을 검색하고, 답장에는 실제로 찾아낸 자료만 인용해요. 모든 모델에서 되고 키도 필요 없어요.',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ 답장 쓰기',
  'generate.working': '쓰는 중…',
  'generate.searching': '근거를 찾는 중…',
  'generate.writing': '답장을 쓰는 중…',
  'generate.srStatus': '반론을 만드는 중',

  // --- reply -----------------------------------------------------------------
  'reply.title': '내 답장',
  'reply.copy': '📋 메시지 복사',
  'reply.copied': '✓ 복사됨',
  'reply.sourcesCited': '출처 {count}개 인용',
  'reply.sourcesCitedOne': '출처 1개 인용',
  'reply.noSources': '인용한 출처 없음',
  'reply.linksRemoved': ' · 확인되지 않은 링크 {count}개 삭제',
  'reply.linksRemovedOne': ' · 확인되지 않은 링크 1개 삭제',
  'reply.toCheck': ' · 확인할 것 {count}개',
  'reply.claimWarn':
    '모델이 실제로 가져온 자료에 없는 링크를 {count}개 만들어 냈어요. 지어낸 인용은 아예 없는 것만 못해서, 보여 드리지 않고 지웠어요.',
  'reply.claimWarnOne':
    '모델이 실제로 가져온 자료에 없는 링크를 1개 만들어 냈어요. 지어낸 인용은 아예 없는 것만 못해서, 보여 드리지 않고 지웠어요.',
  'reply.checkBeforeSending': '보내기 전에 확인하세요',
  'reply.noSourcesRetrieved':
    '이 답장에는 가져온 자료가 하나도 없어요. 여기 담긴 사실 주장은 전부 확인되지 않은 것이니, 기대어 말할 부분은 직접 확인해 보세요.',
  'reply.sourcesTitle': '출처',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ 보내기 전에 — 내 주장에서 가장 약한 곳',
  'briefing.title': '상대의 가장 강한 논리 — 그리고 내가 답한 지점',
  'briefing.tag': '나만 보는 메모 — 보내지 마세요',
  'briefing.building': '상대의 가장 강한 논리를 정리하는 중…',
  'briefing.answered': '내 답장이 여기에 답하고 있나요?',
  'briefing.unused': '가져왔지만 쓰지 않은 자료',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 공유 링크 만들기',
  'share.creating': '링크 만드는 중…',
  'share.copyLink': '링크 복사',
  'share.caveat': '이 주장과 반론을 올려서, 링크를 가진 사람이면 누구나 읽을 수 있게 해요',
  'share.help':
    '이 링크를 가진 사람은 누구나 주장과 반론을 읽을 수 있어요. 목록에 오르지도 검색에 잡히지도 않지만, 그렇다고 비공개는 아니에요. 링크는 1년 뒤에 만료돼요.',
  'share.banner': '누군가 이 답장을 공유했어요',
  'share.generatedWith': '{model}(으)로 만들었어요',
  'share.generatedWithAI': 'AI로 만들었어요',
  'share.theArgument': '원래 주장',
  'share.theReply': '답장',
  'share.steelmanHeading': '이 주장을 가장 강하게 편들면',
  'share.from': '보낸 사람',
  'share.writeYourOwn': '✍️ 내 답장 써 보기',
  'share.startFresh': '처음부터 시작',

  // --- cost ------------------------------------------------------------------
  'cost.actual': '비용:',
  'cost.tokens': '(입력 {in} / 출력 {out})',
  'cost.tokensWithReasoning': '(입력 {in} / 출력 {out}, 추론 {reasoning})',
  'cost.sessionTotal': ' · 이번 세션 합계 {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': '먼저 답하려는 주장을 넣어 주세요',
  'error.needModel': '모델을 골라 주세요',
  'error.needKey': '올바른 API 키를 입력해 주세요',
  'error.needKeyForModels': '먼저 API 키를 입력해 주세요. 모델 목록은 제공사에서 받아 와요.',
  'error.timeout': '요청 시간이 지났어요. 다시 시도해 주세요.',
  'error.generic': '답장을 쓰지 못했어요',
  'error.refreshModels': '모델 목록을 새로 가져오지 못했어요',
  'error.briefing': '상대의 논리를 정리하지 못했어요.',
  'error.publish': '이 반론을 올리지 못했어요.',
  'error.loadShared': '공유된 반론을 불러오지 못했어요.',
  'error.article': '그 기사를 불러오지 못했어요. 대신 본문을 붙여넣어 보세요.',
  'error.searchUnavailable': '근거 검색을 쓸 수 없었어요.',
  'error.speechUnsupported': '이 브라우저는 음성 인식을 지원하지 않아요. Chrome, Edge, Safari를 써 주세요.',
  'error.micDenied': '마이크 사용이 거부됐어요. 이 사이트에 마이크 권한을 허용하고 다시 시도해 주세요.',
  'error.micMissing': '마이크를 찾지 못했어요. 마이크가 연결되어 있는지 확인하고 다시 시도해 주세요.',
  'error.speechNetwork': '음성 인식 서비스에서 네트워크 오류가 났어요. 연결을 확인하고 다시 시도해 주세요.',

  // --- instant mode ----------------------------------------------------------
  'instant.working': '답장을 쓰는 중 (키 필요 없음)…',
  'instant.left': '오늘 무료 답장 {n}개 남았어요',
  'instant.leftOne': '오늘 무료 답장 1개 남았어요',
  'instant.done.title': '오늘 무료 답장은 다 썼어요',
  'instant.done.body':
    '{time}에 다시 채워져요. 로그인하면 하루 한도가 늘어나고, 내 API 키를 추가하면 답장이 저희 서버를 거치지 않고 무제한으로 나가요.',
  'instant.done.byok': '대신 내 API 키 쓰기',
  'instant.turnstile': '확인에 실패했어요 — 페이지를 새로고침하고 다시 시도해 주세요.',
  'instant.error': '지금은 즉시 답장 기능을 쓸 수 없어요 — 잠시 후 다시 시도하거나, 내 API 키를 써 보세요.',
  'instant.badge': '즉시 답장',

  // --- history ---------------------------------------------------------------
  'history.show': '기록',
  'history.hide': '기록 숨기기',
  'history.empty': '아직 저장된 답장이 없어요 — 답장을 만들 때마다 여기, 이 기기에 저장돼요.',
  'history.localOnly':
    '이 기기에만 저장돼요. 로그인하고 보관함 잠금을 해제하면 암호화된 채로 여러 기기에 동기화돼요.',
  'history.synced': '암호화해서 계정에 동기화했어요. 내 기기에서만 읽을 수 있어요.',
  'history.delete': '이 항목 삭제',
  'history.clear': '기록 전체 지우기',
  'history.clearConfirm': '저장된 답장을 모두 지울까요? 동기화된 사본도 함께 지워져요. 되돌릴 수 없어요.',
}

export default ko
