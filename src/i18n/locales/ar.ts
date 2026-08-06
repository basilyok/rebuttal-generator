// العربية — ترجمة en.ts. أي مفتاح ناقص هنا يعود تلقائياً إلى النص الإنجليزي.
//
// ملاحظات المترجم
// - عناصر {name} تبقى كما هي حرفياً؛ الكلمات حولها يمكن أن تتحرك.
// - أسماء المنتجات والمزوّدين (Rebuttal Generator, Claude, Gemini, Tavily,
//   OpenRouter, Groq, DeepSeek, Google) تبقى بالإنجليزية.
// - النبرة بسيطة ودافئة. هذا تطبيق لإقناع شخص واحد، فلا ينبغي أن تبدو
//   الواجهة كبرنامج مؤسسي.

const ar = {
  // --- الواجهة العامة --------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'اكتب الرد الذي يغيّر رأي الطرف الآخر فعلاً',
  'app.updateAvailable': '🎉 صدرت نسخة جديدة!',
  'app.reload': 'إعادة التحميل',

  // --- الحساب ----------------------------------------------------------------
  'account.signIn': 'تسجيل الدخول',
  'account.signInBlurb': 'سجّل الدخول لتبقى مفاتيح API ولغتك معك على كل أجهزتك.',
  'account.signOut': 'تسجيل الخروج',
  'account.signedInAs': 'مسجَّل الدخول باسم {name}',
  'account.menu': 'الحساب',
  'account.keysSynced': 'المفاتيح متزامنة',
  'account.keysLocked': 'المفاتيح مقفلة',
  'account.unlock': 'فتح القفل',
  'account.unlockTitle': 'افتح قفل مفاتيحك المحفوظة',
  'account.unlockBlurb':
    'مفاتيحك مشفَّرة بعبارة سرّ لا تغادر جهازك أبداً، حتى نحن لا نستطيع قراءتها. أدخلها مرة واحدة على هذا الجهاز.',
  'account.passphrase': 'عبارة السرّ',
  'account.passphrasePlaceholder': 'عبارة سرّ خزنتك',
  'account.unlockAction': 'افتح القفل',
  'account.wrongPassphrase': 'هذه العبارة لم تفتح مفاتيحك. حاول مرة أخرى.',
  'account.setupTitle': 'احفظ مفاتيحك على كل أجهزتك',
  'account.setupBlurb':
    'اختر عبارة سرّ. تُشفَّر بها مفاتيح API داخل هذا المتصفح قبل رفعها، فلا يُخزّن الخادم سوى نص مبعثر لا يستطيع قراءته.',
  'account.setupWarning':
    'لا توجد أي طريقة لاستعادة هذه العبارة. إن نسيتها، فكل ما عليك هو إدخال مفاتيح API من جديد، ولن تفقد شيئاً آخر.',
  'account.confirmPassphrase': 'تأكيد عبارة السرّ',
  'account.passphraseMismatch': 'العبارتان غير متطابقتين.',
  'account.passphraseShort': 'استخدم 12 حرفاً على الأقل، فالعبارة القصيرة يمكن تخمينها بعيداً عن الإنترنت.',
  'account.passphraseLettersOnly': 'أضف رقماً أو رمزاً ليصعب تخمينها.',
  'account.saveKeys': 'شفّر واحفظ',
  'account.forgetKeys': 'حذف المفاتيح المحفوظة',
  'account.forgetKeysConfirm': 'هل تحذف مفاتيحك المشفَّرة من الخادم؟ ستبقى المفاتيح في هذا المتصفح.',
  'account.notNow': 'ليس الآن',
  'account.syncing': 'جارٍ الحفظ…',
  'account.vaultSaved': 'حُفظت مفاتيحك مشفَّرة.',
  'account.signInOrUp': 'تسجيل الدخول / إنشاء حساب',
  'account.benefitsTitle': 'لماذا تسجّل الدخول؟',
  'account.benefitsKeys': 'مفاتيح API ترافقك إلى أي جهاز — مشفَّرة بحيث لا يقرأها أحد سواك.',
  'account.benefitsHistory': 'سجل ردودك يُزامَن أيضاً، مشفَّراً بالطريقة نفسها.',
  'account.benefitsQuota': 'ستة ردود فورية مجانية في اليوم بدلاً من ثلاثة.',
  'account.benefitsLanguage': 'اختيارك للغة يبقى معك أينما سجّلت الدخول.',
  'account.signUpTitle': 'أنشئ حسابك',
  'account.signInTitle': 'تسجيل الدخول',
  'account.continueWithGoogle': 'المتابعة عبر Google',
  'account.orDivider': 'أو',
  'account.username': 'اسم المستخدم',
  'account.usernamePlaceholder': '3–32 من الحروف أو الأرقام أو - أو _',
  'account.password': 'كلمة المرور',
  'account.confirmPassword': 'تأكيد كلمة المرور',
  'account.emailOptional': 'البريد الإلكتروني (اختياري)',
  'account.noEmailWarning':
    'من دون بريد إلكتروني لا توجد أي طريقة للعودة إلى حسابك إن نسيت كلمة المرور هذه يوماً — فلا وسيلة لإعادة تعيينها. اكتبها في مكان آمن.',
  'account.createAccount': 'إنشاء حساب',
  'account.signInAction': 'تسجيل الدخول',
  'account.switchToSignIn': 'لديك حساب بالفعل؟ سجّل الدخول',
  'account.switchToSignUp': 'جديد هنا؟ أنشئ حساباً',
  'account.passwordShort': 'استخدم 10 أحرف على الأقل.',
  'account.passwordMismatch': 'كلمتا المرور غير متطابقتين.',
  'account.usernameInvalid': 'اسم المستخدم من 3–32 حرفاً: حروف أو أرقام أو - أو _.',
  'account.usernameTaken': 'هذا الاسم محجوز — جرّب اسماً آخر.',
  'account.badCredentials': 'اسم المستخدم وكلمة المرور غير متطابقين.',
  'account.rateLimited': 'محاولات كثيرة جداً — انتظر دقيقة ثم حاول مرة أخرى.',
  'account.emailInvalid': 'عنوان البريد الإلكتروني هذا لا يبدو صحيحاً.',
  'account.serverError': 'حدث خطأ من جهتنا. حاول مرة أخرى بعد قليل من فضلك.',
  'account.signOutFirst':
    'هذا حساب مختلف. حفاظاً على فصل الحسابات، سُجّل الخروج من هذا الجهاز ومُسح السجل المحفوظ عليه — سجّل الدخول من جديد للمتابعة.',
  'account.authError': 'لم يكتمل تسجيل الدخول. حاول مرة أخرى من فضلك.',

  // --- اللغة -----------------------------------------------------------------
  'language.label': 'اللغة',
  'language.switchToEnglish': 'English',
  'language.choose': 'اختر اللغة',
  'language.followDevice': 'اتبع لغة جهازي',

  // --- إعدادات الذكاء الاصطناعي ----------------------------------------------
  'settings.chooseModel': 'اختر نموذجاً',
  'settings.hide': 'إخفاء',
  'settings.change': 'تغيير',
  'settings.provider': 'مزوّد الذكاء الاصطناعي',
  'settings.model': 'النموذج',
  'settings.refresh': '↻ تحديث',
  'settings.refreshing': 'جارٍ التحديث…',
  'settings.refreshTitle': 'اجلب قائمة النماذج الحالية من المزوّد',
  'settings.useShortList': 'استخدم القائمة القصيرة',
  'settings.useShortListTitle': 'العودة إلى القائمة القصيرة المنتقاة يدوياً',
  'settings.modelsUpdated': '{count} من النماذج · حُدّثت {date}',
  'settings.apiKeyLabel': 'مفتاح API لـ{provider}',
  'settings.apiKeyPlaceholder': 'أدخل مفتاح API',
  'settings.saveKey': 'حفظ المفتاح',
  'settings.cancel': 'إلغاء',
  'settings.changeKey': 'تغيير مفتاح API',
  'settings.keyHelpFree':
    'يطلب هذا المزوّد مفتاح API حتى لنماذجه المجانية، لكن إنشاء المفتاح مجاني ولا يحتاج أي بيانات دفع. ',
  'settings.keyHelpPaid':
    'يُحفظ مفتاحك في هذا المتصفح وحده، ولا يُرسل إلا إلى هذا المزوّد. لن تحتاج إلى إدخاله مرة أخرى. ',
  'settings.keyHelpSynced':
    'مفتاحك مشفَّر على هذا الجهاز ومُزامَن مع حسابك، فلن تحتاج إلى إدخاله مرة أخرى على أي جهاز. ',
  'settings.getOneFrom': 'احصل على واحد من',
  'settings.preferNoKey': 'تفضّل ألا تستخدم مفتاحاً أصلاً؟ اختر {option} من قائمة مزوّد الذكاء الاصطناعي.',
  'settings.localOption': 'محلي داخل المتصفح (مجاني، بلا مفتاح)',
  'settings.tavilyLabel': 'مفتاح البحث عن الأدلة',
  'settings.optional': 'اختياري',
  'settings.save': 'حفظ',
  'settings.saved': '✓ حُفظ',
  'settings.tavilyHelp':
    'البحث عن الأدلة يعمل أصلاً بلا أي مفتاح. مفتاح {link} المجاني (1000 عملية بحث شهرياً، بلا بطاقة) يرفع الحد الأقصى فقط إن بلغته.',
  'settings.costPerReply': '≈ {cost} لكل رد',
  'settings.costIncludesReasoning': '≈ {cost} لكل رد (شاملاً رموز التفكير المخفية)',
  'settings.costFreeLocal': 'مجاني — يعمل على جهازك، ولا تُحتسب عليك أي تكلفة',
  'settings.costUnknown': 'سعر هذا النموذج غير معروف',
  'settings.costFreeModel': 'نموذج مجاني — بلا رسوم',

  // --- المُدخَل ---------------------------------------------------------------
  'input.label': 'على ماذا تردّ؟',
  'input.modeGroup': 'طريقة الإدخال',
  'input.modeText': '✍️ تحدّث أو اكتب',
  'input.modeUrl': '🔗 رابط مقال',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': 'اجلب المقال',
  'input.fetching': 'جارٍ الجلب…',
  'input.startRecording': '🎙 ابدأ التسجيل',
  'input.stopRecording': '⏹ أوقف التسجيل',
  'input.recording': 'جارٍ التسجيل…',
  'input.clear': 'مسح',
  'input.placeholderText': 'اكتب الحجّة هنا، أو استخدم «ابدأ التسجيل» لإملائها…',
  'input.placeholderUrl': 'سيظهر نص المقال هنا بعد جلبه، ويمكنك تعديله قبل إنشاء الرد.',
  'input.articleWords': '{count} كلمة',
  'input.articleViaArchive': ' · مقروء من نسخة محفوظة في Internet Archive',
  'input.articleTruncated': ' · اختُصر لإبقاء الطلب صغيراً',

  // --- المتلقّي ---------------------------------------------------------------
  'audience.label': 'من كتبها، وأين؟',
  'audience.optional': 'اختياري — لكنه يغيّر طريقة كتابة الرد',
  'audience.placeholder': 'مثلاً: والد زوجتي، في رسائل نصية · شخص لا أعرفه على LinkedIn',
  'audience.help':
    'اتركه فارغاً وسيُستنتج من النص. أما ذكرُ من هو الشخص فيتيح للرد أن يستشهد بمصادر يثق بها أصلاً وأن يقترب من طريقته في الكلام.',

  // --- لغة الرد ---------------------------------------------------------------
  'replyLang.detected': 'الرد بلغة {language}',
  'replyLang.change': 'تغيير',
  'replyLang.label': 'اكتب الرد بلغة',
  'replyLang.help': 'الرد موجَّه إلى من كتب الحجّة، فهو يتبع لغته هو، لا لغة الواجهة.',
  'replyLang.auto': 'مطابقة لغة الحجّة ({language})',

  // --- المصادر ----------------------------------------------------------------
  'sources.toggle': 'ابحث عن أدلة حقيقية للاستشهاد بها',
  'sources.hint':
    ' — يبحث في الويب أولاً، ولا يستشهد الرد إلا بما وُجد فعلاً. يعمل مع كل النماذج، وبلا حاجة إلى مفتاح.',

  // --- الإنشاء ----------------------------------------------------------------
  'generate.submit': '✨ اكتب ردي',
  'generate.working': 'جارٍ الكتابة…',
  'generate.searching': 'جارٍ البحث عن أدلة…',
  'generate.writing': 'جارٍ كتابة الرد…',
  'generate.srStatus': 'جارٍ إنشاء الرد',

  // --- الرد -------------------------------------------------------------------
  'reply.title': 'ردّك',
  'reply.copy': '📋 انسخ الرسالة',
  'reply.copied': '✓ نُسخت',
  'reply.sourcesCited': 'استُشهد بـ{count} من المصادر',
  'reply.sourcesCitedOne': 'استُشهد بمصدر واحد',
  'reply.noSources': 'لم يُستشهَد بأي مصدر',
  'reply.linksRemoved': ' · أُزيل {count} من الروابط غير الموثَّقة',
  'reply.linksRemovedOne': ' · أُزيل رابط واحد غير موثَّق',
  'reply.toCheck': ' · {count} بحاجة إلى تحقّق',
  'reply.claimWarn':
    'أنتج النموذج {count} من الروابط لم تكن ضمن المصادر التي جُلبت فعلاً. أُزيلت بدل أن تُعرض عليك، لأن استشهاداً مُختلقاً أسوأ من لا استشهاد.',
  'reply.claimWarnOne':
    'أنتج النموذج رابطاً واحداً لم يكن ضمن المصادر التي جُلبت فعلاً. أُزيل بدل أن يُعرض عليك، لأن استشهاداً مُختلقاً أسوأ من لا استشهاد.',
  'reply.checkBeforeSending': 'تحقّق قبل الإرسال',
  'reply.noSourcesRetrieved':
    'لم تُجلب أي مصادر لهذا الرد. كل ما فيه من ادعاءات واقعية غير موثَّق — تحقّق من كل ما تنوي الاعتماد عليه.',
  'reply.sourcesTitle': 'المصادر',

  // --- نقطة الضعف والإحاطة ----------------------------------------------------
  'weakLink.title': '⚠️ قبل أن ترسل — نقطة الضعف في موقفك',
  'briefing.title': 'أقوى حجّة لدى الطرف الآخر — وأين يردّ عليها ردّك',
  'briefing.tag': 'لك أنت وحدك — لا تُرسل هذا',
  'briefing.building': 'جارٍ بناء أقوى حجّة لدى الطرف الآخر…',
  'briefing.answered': 'هل يردّ ردّك عليها؟',
  'briefing.unused': 'جُلبت ولم تُستخدم',

  // --- المشاركة ---------------------------------------------------------------
  'share.get': '🔗 احصل على رابط للمشاركة',
  'share.creating': 'جارٍ إنشاء الرابط…',
  'share.copyLink': 'انسخ الرابط',
  'share.caveat': 'ينشر هذه الحجّة والرد عليها ليقرأهما كل من يملك الرابط',
  'share.help':
    'كل من يملك هذا الرابط يستطيع قراءة الحجّة والرد. الصفحة غير مُدرجة — لا تظهر في محركات البحث ولا يمكن تصفّحها — لكنها ليست خاصة. تنتهي صلاحية الروابط بعد سنة.',
  'share.banner': 'شارك أحدهم هذا الرد معك',
  'share.generatedWith': 'أُنشئ بواسطة {model}',
  'share.generatedWithAI': 'أُنشئ بالذكاء الاصطناعي',
  'share.theArgument': 'الحجّة',
  'share.theReply': 'الرد',
  'share.steelmanHeading': 'أقوى ما يُقال دعماً لهذه الحجّة',
  'share.from': 'من',
  'share.writeYourOwn': '✍️ اكتب ردك أنت',
  'share.startFresh': 'ابدأ من جديد',

  // --- التكلفة ----------------------------------------------------------------
  'cost.actual': 'التكلفة:',
  'cost.tokens': '({in} وارد / {out} صادر)',
  'cost.tokensWithReasoning': '({in} وارد / {out} صادر، {reasoning} تفكير)',
  'cost.sessionTotal': ' · إجمالي الجلسة {total}',

  // --- الأخطاء ----------------------------------------------------------------
  'error.needArgument': 'أضف أولاً الحجّة التي تريد الرد عليها',
  'error.needModel': 'اختر نموذجاً من فضلك',
  'error.needKey': 'أدخل مفتاح API صالحاً من فضلك',
  'error.needKeyForModels': 'أدخل مفتاح API أولاً — قائمة النماذج تأتي من المزوّد.',
  'error.timeout': 'انتهت مهلة الطلب. حاول مرة أخرى من فضلك.',
  'error.generic': 'تعذّرت كتابة الرد',
  'error.refreshModels': 'تعذّر تحديث قائمة النماذج',
  'error.briefing': 'تعذّر بناء حجّة الطرف الآخر.',
  'error.publish': 'تعذّر نشر هذا الرد.',
  'error.loadShared': 'تعذّر تحميل الرد المشارَك.',
  'error.article': 'تعذّر تحميل هذا المقال. جرّب لصق النص بدلاً من ذلك.',
  'error.searchUnavailable': 'البحث عن الأدلة غير متاح.',
  'error.speechUnsupported': 'هذا المتصفح لا يدعم التعرّف على الكلام. استخدم Chrome أو Edge أو Safari.',
  'error.micDenied': 'رُفض الوصول إلى الميكروفون. اسمح لهذا الموقع باستخدام الميكروفون ثم حاول مجدداً.',
  'error.micMissing': 'لم يُعثر على ميكروفون. تأكد من توصيل ميكروفون ثم حاول مجدداً.',
  'error.speechNetwork': 'واجهت خدمة الكلام خطأ في الشبكة. تحقّق من اتصالك ثم حاول مجدداً.',

  // --- الوضع الفوري -----------------------------------------------------------
  'instant.working': 'جارٍ كتابة ردك (بلا حاجة إلى مفتاح)…',
  'instant.left': '{n} من الردود المجانية متبقية اليوم',
  'instant.leftOne': 'رد مجاني واحد متبقٍ اليوم',
  'instant.done.title': 'نفدت ردودك المجانية لهذا اليوم',
  'instant.done.body':
    'تعود عند {time}. سجّل الدخول للحصول على حصة يومية أكبر، أو أضف مفتاح API الخاص بك لردود غير محدودة لا تمر أبداً بخوادمنا.',
  'instant.done.byok': 'استخدم مفتاح API الخاص بك بدلاً من ذلك',
  'instant.turnstile': 'فشل التحقّق — أعد تحميل الصفحة وحاول مرة أخرى.',
  'instant.error': 'الوضع الفوري غير متاح الآن — حاول مرة أخرى بعد قليل، أو استخدم مفتاح API الخاص بك.',
  'instant.badge': 'وضع فوري',

  // --- السجل ------------------------------------------------------------------
  'history.show': 'السجل',
  'history.hide': 'إخفاء السجل',
  'history.empty': 'لا ردود محفوظة بعد — كل رد تُنشئه يُحفظ هنا، على هذا الجهاز.',
  'history.localOnly':
    'محفوظ على هذا الجهاز فقط. سجّل الدخول وافتح قفل خزنتك لمزامنته، مشفَّراً، على كل أجهزتك.',
  'history.synced': 'مشفَّر ومُزامَن مع حسابك. أجهزتك وحدها تستطيع قراءته.',
  'history.delete': 'حذف هذا الرد',
  'history.clear': 'مسح كل السجل',
  'history.clearConfirm': 'هل تحذف كل الردود المحفوظة؟ ستُمسح النسخة المُزامَنة أيضاً. لا يمكن التراجع عن هذا.',
}

export default ar
