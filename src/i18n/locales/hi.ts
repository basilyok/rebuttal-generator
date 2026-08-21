// Hindi — a translation of en.ts, which stays the source of truth.
//
// Register: everyday, warm Hindustani with «आप» throughout — the way one thoughtful
// adult writes to another. Deliberately not the Sanskritised officialese of forms and
// notices; this app is a private message, not a government letter.

const hi = {
  // --- shell -----------------------------------------------------------------
  'app.title': '🎤 Rebuttal Generator',
  'app.subtitle': 'वह जवाब लिखें जो सच में उनका मन बदल दे',
  'app.updateAvailable': '🎉 नया वर्शन आ गया है!',
  'app.reload': 'फिर से लोड करें',

  // --- account ---------------------------------------------------------------
  'account.signIn': 'साइन इन करें',
  'account.signInBlurb': 'साइन इन करें, ताकि आपकी API कुंजियाँ और भाषा हर डिवाइस पर बनी रहें।',
  'account.signOut': 'साइन आउट करें',
  'account.signedInAs': '{name} के रूप में साइन इन हैं',
  'account.menu': 'खाता',
  'account.keysSynced': 'कुंजियाँ सिंक हैं',
  'account.keysLocked': 'कुंजियाँ बंद हैं',
  'account.unlock': 'खोलें',
  'account.unlockTitle': 'अपनी सेव की हुई कुंजियाँ खोलें',
  'account.unlockBlurb':
    'आपकी कुंजियाँ एक पासफ़्रेज़ से बंद हैं, और वह पासफ़्रेज़ कभी आपके डिवाइस से बाहर नहीं जाता — हम भी उन्हें पढ़ नहीं सकते। इस डिवाइस पर इसे बस एक बार डाल दें।',
  'account.passphrase': 'पासफ़्रेज़',
  'account.passphrasePlaceholder': 'आपका वॉल्ट पासफ़्रेज़',
  'account.unlockAction': 'खोलें',
  'account.wrongPassphrase': 'इस पासफ़्रेज़ से आपकी कुंजियाँ नहीं खुलीं। एक बार फिर कोशिश करें।',
  'account.setupTitle': 'अपनी कुंजियाँ हर डिवाइस पर सेव रखें',
  'account.setupBlurb':
    'एक पासफ़्रेज़ चुन लें। आपकी API कुंजियाँ अपलोड होने से पहले इसी ब्राउज़र में उसी पासफ़्रेज़ से एन्क्रिप्ट हो जाती हैं, इसलिए सर्वर पर सिर्फ़ उलझा हुआ टेक्स्ट पहुँचता है, जिसे वह पढ़ ही नहीं सकता।',
  'account.setupWarning':
    'यह पासफ़्रेज़ वापस पाने का कोई रास्ता नहीं है। भूल गए तो बस अपनी API कुंजियाँ दोबारा डाल देनी होंगी — इसके अलावा कुछ नहीं खोता।',
  'account.confirmPassphrase': 'पासफ़्रेज़ दोबारा डालें',
  'account.passphraseMismatch': 'दोनों पासफ़्रेज़ एक जैसे नहीं हैं।',
  'account.passphraseShort': 'कम से कम 12 अक्षर रखें — छोटा पासफ़्रेज़ ऑफ़लाइन ही अंदाज़े से तोड़ा जा सकता है।',
  'account.passphraseLettersOnly': 'कोई अंक या चिह्न भी जोड़ दें, ताकि अंदाज़ा लगाना मुश्किल हो।',
  'account.saveKeys': 'एन्क्रिप्ट करके सेव करें',
  'account.forgetKeys': 'सेव की हुई कुंजियाँ हटाएँ',
  'account.forgetKeysConfirm': 'सर्वर से आपकी एन्क्रिप्टेड कुंजियाँ हटा दें? इस ब्राउज़र में आपकी कुंजियाँ बनी रहेंगी।',
  'account.notNow': 'अभी नहीं',
  'account.syncing': 'सेव हो रहा है…',
  'account.vaultSaved': 'आपकी कुंजियाँ एन्क्रिप्ट होकर सेव हो गई हैं।',
  'account.signInOrUp': 'साइन इन / साइन अप करें',
  'account.benefitsTitle': 'साइन इन क्यों करें?',
  'account.benefitsKeys': 'आपकी API कुंजियाँ हर डिवाइस पर आपके साथ चलती हैं — एन्क्रिप्ट होकर, ताकि उन्हें सिर्फ़ आप ही पढ़ सकें।',
  'account.benefitsHistory': 'आपके जवाबों का इतिहास भी सिंक होता है — उसी तरह एन्क्रिप्ट होकर।',
  'account.benefitsQuota': 'रोज़ तीन के बजाय छह मुफ़्त इंस्टेंट जवाब।',
  'account.benefitsLanguage': 'जहाँ भी आप साइन इन करें, आपकी चुनी हुई भाषा वहीं बनी रहती है।',
  'account.signUpTitle': 'अपना खाता बनाएँ',
  'account.signInTitle': 'साइन इन करें',
  'account.continueWithGoogle': 'Google से जारी रखें',
  'account.orDivider': 'या',
  'account.username': 'यूज़रनेम',
  'account.usernamePlaceholder': '3–32 अक्षर, अंक, - या _',
  'account.password': 'पासवर्ड',
  'account.confirmPassword': 'पासवर्ड दोबारा डालें',
  'account.emailOptional': 'ईमेल (ज़रूरी नहीं)',
  'account.noEmailWarning':
    'ईमेल नहीं दिया तो यह पासवर्ड भूल जाने पर वापस लौटने का कोई रास्ता नहीं होगा — रीसेट करने के लिए कुछ है ही नहीं। इसे कहीं सुरक्षित जगह लिख लें।',
  'account.createAccount': 'खाता बनाएँ',
  'account.signInAction': 'साइन इन करें',
  'account.switchToSignIn': 'पहले से खाता है? साइन इन करें',
  'account.switchToSignUp': 'यहाँ नए हैं? खाता बना लें',
  'account.passwordShort': 'कम से कम 10 अक्षर रखें।',
  'account.passwordMismatch': 'दोनों पासवर्ड एक जैसे नहीं हैं।',
  'account.usernameInvalid': 'यूज़रनेम 3–32 अक्षरों का होता है: अक्षर, अंक, - या _।',
  'account.usernameTaken': 'यह यूज़रनेम पहले से लिया हुआ है — कोई और आज़मा लें।',
  'account.badCredentials': 'यह यूज़रनेम और पासवर्ड आपस में मेल नहीं खाए।',
  'account.rateLimited': 'बहुत सारी कोशिशें हो गईं — कुछ मिनट रुककर फिर कोशिश करें।',
  'account.emailInvalid': 'यह ईमेल पता ठीक नहीं लग रहा।',
  'account.serverError': 'हमारी तरफ़ से कुछ गड़बड़ हो गई। थोड़ी देर बाद फिर कोशिश करें।',
  'account.signOutFirst':
    'यह एक अलग खाता है। खातों को अलग-अलग रखने के लिए इस डिवाइस को साइन आउट कर दिया गया है और इस डिवाइस पर सेव इतिहास मिटा दिया गया है — जारी रखने के लिए फिर से साइन इन करें।',
  'account.authError': 'साइन इन पूरा नहीं हो सका। एक बार फिर कोशिश करें।',

  // --- recovery --------------------------------------------------------------
  'recovery.title': 'आपका रिकवरी कोड',
  'recovery.blurb':
    'पासवर्ड भूल जाने पर यही कोड आपको आपकी सहेजी गई API कुंजियों और इतिहास तक वापस पहुँचाता है। यह सिर्फ़ इसी बार दिखेगा, इसलिए इसे ऐसी जगह रखें जहाँ बाद में भी मिल जाए — पासवर्ड मैनेजर में, या कागज़ पर।',
  'recovery.regenerateHint':
    'जब तक आप साइन इन हैं, आप कभी भी नया कोड बना सकते हैं — कोड खो जाना झंझट है, आफ़त नहीं।',
  'recovery.copy': 'कोड कॉपी करें',
  'recovery.copied': 'कॉपी हो गया',
  'recovery.warning':
    'अगर आपका पासवर्ड और यह कोड दोनों खो गए, तो आपकी सहेजी गई API कुंजियाँ और इतिहास कोई भी वापस नहीं ला सकता — हम भी नहीं।',
  'recovery.confirm': 'मैंने यह कोड किसी सुरक्षित जगह सहेज लिया है',
  'recovery.done': 'हो गया',
  'recovery.working': 'सेट किया जा रहा है…',
  'recovery.setupFailed':
    'अभी रिकवरी कोड सेट नहीं हो सका। फिर कोशिश करें, और बार-बार ऐसा हो तो दोबारा साइन इन करें।',
  'recovery.promptBody':
    'आपके पास अभी रिकवरी कोड नहीं है। इसके बिना पासवर्ड भूलने का मतलब है सहेजी गई कुंजियाँ और इतिहास हमेशा के लिए चले जाना।',
  'recovery.promptAction': 'रिकवरी सेट करें',
  'recovery.promptDismiss': 'अभी नहीं',
  'recovery.statusNone': 'रिकवरी सेट करें',
  'recovery.statusFinishing': 'रिकवरी सेटअप अधूरा · पूरा करें',
  'recovery.statusReady': 'रिकवरी तैयार · नया कोड',
  'recovery.statusUnknown': 'रिकवरी जाँची नहीं गई · नया कोड',
  'recovery.statusStale': 'रिकवरी कोड शायद काम न करे · नया कोड',
  'recovery.resetTitle': 'अपना पासवर्ड रीसेट करें',
  'recovery.resetIntro': 'अपना उपयोगकर्ता नाम और सहेजा हुआ रिकवरी कोड डालें।',
  'recovery.codeLabel': 'रिकवरी कोड',
  'recovery.newPassword': 'नया पासवर्ड',
  'recovery.resetAction': 'पासवर्ड रीसेट करें',
  'recovery.resetContinue': 'आगे बढ़ें',
  'recovery.resetBack': 'वापस',
  'recovery.resetWorking': 'रीसेट हो रहा है…',
  'recovery.resetFailed': 'यह उपयोगकर्ता नाम और रिकवरी कोड मेल नहीं खाते।',
  'recovery.resetCorrupt':
    'सहेजा गया रिकवरी रिकॉर्ड क्षतिग्रस्त है और खोला नहीं जा सकता। कोड दोबारा डालने से मदद नहीं मिलेगी।',
  'recovery.resetInterrupted':
    'रीसेट बीच में रुक गया। अभी चुने हुए नए पासवर्ड से साइन इन करके देखें — अगर वह चलता है, तो रीसेट पूरा हो गया। अगर नहीं, तो आपका पुराना पासवर्ड अब भी काम करता है। दोनों ही स्थितियों में, बाद में नया रिकवरी कोड बना लें।',
  'recovery.resetBlocked':
    'इस खाते पर रिकवरी सेटअप अभी पूरा नहीं हुआ है। इसे पूरा करने के लिए एक बार पासवर्ड से साइन इन करें।',
  'recovery.forgot': 'पासवर्ड भूल गए?',
  'recovery.leaveConfirm': 'आपका रिकवरी कोड अभी स्क्रीन पर है और दोबारा नहीं दिखेगा। बिना सहेजे चले जाएँ?',
  'recovery.replacesOld': 'यह पहले के किसी भी कोड की जगह ले लेता है — पुराना कोड अब से काम नहीं करेगा।',
  'recovery.rotateConfirm':
    'नया रिकवरी कोड बनाएँ? आपका मौजूदा कोड तुरंत काम करना बंद कर देगा, और नया कोड आपको सहेजना होगा।',
  'recovery.promptLostBody':
    'आपके पास रिकवरी कोड है, पर इस डिवाइस पर कभी पुष्टि नहीं हुई कि आपने उसे सहेजा था — अगर वह लिखने से पहले ही खो गया, तो उससे खाता वापस नहीं मिलेगा। आप अभी उसकी जगह नया कोड बना सकते हैं।',
  'recovery.promptLostAction': 'नया कोड बनाएँ',

  // --- language --------------------------------------------------------------
  'language.label': 'भाषा',
  'language.switchToEnglish': 'English',
  'language.choose': 'भाषा चुनें',
  'language.followDevice': 'मेरे डिवाइस के हिसाब से',

  // --- AI settings -----------------------------------------------------------
  'settings.chooseModel': 'कोई मॉडल चुनें',
  'settings.hide': 'छिपाएँ',
  'settings.change': 'बदलें',
  'settings.provider': 'AI प्रोवाइडर',
  'settings.model': 'मॉडल',
  'settings.refresh': '↻ ताज़ा करें',
  'settings.refreshing': 'ताज़ा किया जा रहा है…',
  'settings.refreshTitle': 'प्रोवाइडर के पास इस वक्त जो मॉडल हैं, उनकी सूची लाएँ',
  'settings.useShortList': 'छोटी सूची इस्तेमाल करें',
  'settings.useShortListTitle': 'चुनी हुई छोटी सूची पर वापस जाएँ',
  'settings.modelsUpdated': '{count} मॉडल · {date} को अपडेट हुए',
  'settings.apiKeyLabel': '{provider} API कुंजी',
  'settings.apiKeyPlaceholder': 'अपनी API कुंजी डालें',
  'settings.saveKey': 'कुंजी सेव करें',
  'settings.cancel': 'रहने दें',
  'settings.changeKey': 'API कुंजी बदलें',
  'settings.keyHelpFree':
    'इस प्रोवाइडर को अपने मुफ़्त मॉडल के लिए भी API कुंजी चाहिए, पर कुंजी बनाना मुफ़्त है — पेमेंट की कोई जानकारी नहीं देनी पड़ती। ',
  'settings.keyHelpPaid':
    'आपकी कुंजी सिर्फ़ इसी ब्राउज़र में सेव होती है, और सिर्फ़ इसी प्रोवाइडर को भेजी जाती है। इसे दोबारा डालने की ज़रूरत नहीं पड़ेगी। ',
  'settings.keyHelpSynced':
    'आपकी कुंजी इसी डिवाइस पर एन्क्रिप्ट होकर आपके खाते में सिंक हो जाती है, इसलिए किसी भी डिवाइस पर इसे दोबारा डालने की ज़रूरत नहीं पड़ेगी। ',
  'settings.getOneFrom': 'कुंजी यहाँ से लें:',
  'settings.preferNoKey': 'कोई कुंजी ही नहीं चाहिए? AI प्रोवाइडर की सूची में {option} चुन लें।',
  'settings.localOption': 'ब्राउज़र में ही, लोकल (मुफ़्त, कोई कुंजी नहीं)',
  'settings.tavilyLabel': 'सबूत खोजने की कुंजी',
  'settings.optional': 'ज़रूरी नहीं',
  'settings.save': 'सेव करें',
  'settings.saved': '✓ सेव हो गया',
  'settings.tavilyHelp':
    'सबूत की खोज बिना किसी कुंजी के भी चलती है। मुफ़्त {link} कुंजी (महीने में 1,000 खोजें, कार्ड की ज़रूरत नहीं) सिर्फ़ तब काम आती है, जब आप तय सीमा तक पहुँच जाएँ।',
  'settings.costPerReply': '≈ हर जवाब पर {cost}',
  'settings.costIncludesReasoning': '≈ हर जवाब पर {cost} (छिपे हुए रीज़निंग टोकन मिलाकर)',
  'settings.costFreeLocal': 'मुफ़्त — आपके अपने डिवाइस पर चलता है, कोई बिल नहीं बनता',
  'settings.costUnknown': 'इस मॉडल की कीमत पता नहीं है',
  'settings.costFreeModel': 'मुफ़्त मॉडल — कोई शुल्क नहीं',

  // --- input -----------------------------------------------------------------
  'input.label': 'आप किस बात का जवाब दे रहे हैं?',
  'input.modeGroup': 'लिखने का तरीका',
  'input.modeText': '✍️ बोलें या टाइप करें',
  'input.modeUrl': '🔗 लेख का URL',
  'input.urlPlaceholder': 'https://example.com/the-article',
  'input.fetchArticle': 'लेख लाएँ',
  'input.fetching': 'लाया जा रहा है…',
  'input.startRecording': '🎙 रिकॉर्डिंग शुरू करें',
  'input.stopRecording': '⏹ रिकॉर्डिंग बंद करें',
  'input.recording': 'रिकॉर्ड हो रहा है…',
  'input.clear': 'मिटाएँ',
  'input.placeholderText': 'जिस बात का जवाब देना है, वह यहाँ टाइप करें — या बोलकर लिखवाने के लिए रिकॉर्डिंग शुरू करें…',
  'input.placeholderUrl': 'लेख आते ही उसका टेक्स्ट यहाँ दिखेगा — जवाब बनवाने से पहले आप इसमें बदलाव कर सकते हैं।',
  'input.articleWords': '{count} शब्द',
  'input.articleViaArchive': ' · Internet Archive की सहेजी हुई कॉपी से पढ़ा गया',
  'input.articleTruncated': ' · अनुरोध छोटा रखने के लिए काटा गया',

  // --- audience --------------------------------------------------------------
  'audience.label': 'यह किसने लिखा, और कहाँ?',
  'audience.optional': 'ज़रूरी नहीं — पर इससे जवाब का पूरा अंदाज़ बदल जाता है',
  'audience.placeholder': 'जैसे: मेरे ससुर, मैसेज पर · LinkedIn पर कोई अनजान शख़्स',
  'audience.help':
    'खाली छोड़ देंगे तो यह बात टेक्स्ट से ही अंदाज़ लगा ली जाएगी। वे कौन हैं यह बता देने से जवाब उन्हीं स्रोतों का सहारा ले पाता है जिन पर वे पहले से भरोसा करते हैं, और उन्हीं के लहजे में लिखा जाता है।',

  // --- reply language --------------------------------------------------------
  'replyLang.detected': 'जवाब {language} में लिखा जाएगा',
  'replyLang.change': 'बदलें',
  'replyLang.label': 'जवाब इस भाषा में लिखें',
  'replyLang.help': 'जवाब उसी शख़्स के पास जाता है जिसने वह बात लिखी है, इसलिए वह उन्हीं की भाषा में जाता है — इंटरफ़ेस की भाषा में नहीं।',
  'replyLang.auto': 'उसी भाषा में जिसमें बात लिखी है ({language})',

  // --- sources ---------------------------------------------------------------
  'sources.toggle': 'हवाला देने लायक असली सबूत खोजें',
  'sources.hint':
    ' — पहले वेब पर खोज होती है, और जवाब सिर्फ़ उन्हीं चीज़ों का हवाला दे सकता है जो सच में मिलीं। हर मॉडल के साथ चलता है, कोई कुंजी नहीं चाहिए।',

  // --- generate --------------------------------------------------------------
  'generate.submit': '✨ मेरा जवाब लिखें',
  'generate.working': 'लिखा जा रहा है…',
  'generate.searching': 'सबूत खोजे जा रहे हैं…',
  'generate.writing': 'जवाब लिखा जा रहा है…',
  'generate.srStatus': 'जवाब तैयार हो रहा है',

  // --- reply -----------------------------------------------------------------
  'reply.title': 'आपका जवाब',
  'reply.copy': '📋 संदेश कॉपी करें',
  'reply.copied': '✓ कॉपी हो गया',
  'reply.sourcesCited': '{count} स्रोतों का हवाला',
  'reply.sourcesCitedOne': '1 स्रोत का हवाला',
  'reply.noSources': 'किसी स्रोत का हवाला नहीं',
  'reply.linksRemoved': ' · {count} बिना जाँचे लिंक हटाए गए',
  'reply.linksRemovedOne': ' · 1 बिना जाँचा लिंक हटाया गया',
  'reply.toCheck': ' · {count} जाँचने बाकी',
  'reply.claimWarn':
    'मॉडल ने {count} ऐसे लिंक बना दिए जो सच में मिले स्रोतों में थे ही नहीं। उन्हें आपको दिखाने के बजाय हटा दिया गया, क्योंकि गढ़ा हुआ हवाला, हवाला न देने से भी बुरा होता है।',
  'reply.claimWarnOne':
    'मॉडल ने 1 ऐसा लिंक बना दिया जो सच में मिले स्रोतों में था ही नहीं। उसे आपको दिखाने के बजाय हटा दिया गया, क्योंकि गढ़ा हुआ हवाला, हवाला न देने से भी बुरा होता है।',
  'reply.checkBeforeSending': 'भेजने से पहले जाँच लें',
  'reply.noSourcesRetrieved':
    'इस जवाब के लिए कोई स्रोत नहीं मिला। इसमें लिखी हर तथ्य वाली बात बिना जाँची हुई है — जिस पर भी टिकने का इरादा हो, उसे पहले खुद देख लें।',
  'reply.sourcesTitle': 'स्रोत',

  // --- weak link + briefing --------------------------------------------------
  'weakLink.title': '⚠️ भेजने से पहले — आपकी अपनी बात का कमज़ोर हिस्सा',
  'briefing.title': 'उनका सबसे मज़बूत पक्ष — और आप उसका जवाब कहाँ देते हैं',
  'briefing.tag': 'सिर्फ़ आपके लिए — यह मत भेजिए',
  'briefing.building': 'उनका सबसे मज़बूत पक्ष तैयार किया जा रहा है…',
  'briefing.answered': 'क्या आपका जवाब इसका उत्तर देता है?',
  'briefing.unused': 'मिला, पर इस्तेमाल नहीं हुआ',

  // --- share -----------------------------------------------------------------
  'share.get': '🔗 साझा करने लायक लिंक बनाएँ',
  'share.creating': 'लिंक बन रहा है…',
  'share.copyLink': 'लिंक कॉपी करें',
  'share.caveat': 'यह दलील और जवाब, दोनों प्रकाशित कर देता है — लिंक वाला कोई भी उन्हें पढ़ सकेगा',
  'share.help':
    'इस लिंक वाला कोई भी शख़्स दलील और जवाब पढ़ सकता है। यह अनलिस्टेड है — न सर्च में आता है, न कहीं लिस्ट में — पर निजी भी नहीं है। लिंक एक साल बाद खत्म हो जाते हैं।',
  'share.banner': 'किसी ने यह जवाब आपके साथ साझा किया है',
  'share.generatedWith': '{model} से बनाया गया',
  'share.generatedWithAI': 'AI से बनाया गया',
  'share.theArgument': 'वह दलील',
  'share.theReply': 'जवाब',
  'share.steelmanHeading': 'इस दलील के पक्ष में सबसे मज़बूत तर्क',
  'share.from': 'भेजने वाले',
  'share.writeYourOwn': '✍️ अपना जवाब खुद लिखें',
  'share.startFresh': 'नए सिरे से शुरू करें',

  // --- cost ------------------------------------------------------------------
  'cost.actual': 'लागत:',
  'cost.tokens': '({in} इनपुट / {out} आउटपुट)',
  'cost.tokensWithReasoning': '({in} इनपुट / {out} आउटपुट, {reasoning} रीज़निंग)',
  'cost.sessionTotal': ' · इस बैठक का कुल {total}',

  // --- errors ----------------------------------------------------------------
  'error.needArgument': 'पहले वह बात डालें जिसका जवाब देना है',
  'error.needModel': 'कोई मॉडल चुन लें',
  'error.needKey': 'सही API कुंजी डालें',
  'error.needKeyForModels': 'पहले अपनी API कुंजी डालें — मॉडल की सूची प्रोवाइडर से ही आती है।',
  'error.timeout': 'अनुरोध में बहुत समय लग गया। एक बार फिर कोशिश करें।',
  'error.generic': 'जवाब नहीं लिखा जा सका',
  'error.refreshModels': 'मॉडल की सूची ताज़ा नहीं हो सकी',
  'error.briefing': 'उनका पक्ष तैयार नहीं हो सका।',
  'error.publish': 'यह जवाब प्रकाशित नहीं हो सका।',
  'error.loadShared': 'वह साझा किया हुआ जवाब खुल नहीं सका।',
  'error.article': 'वह लेख नहीं खुल सका। इसके बजाय टेक्स्ट कॉपी करके यहाँ डाल दें।',
  'error.searchUnavailable': 'सबूत की खोज इस वक्त उपलब्ध नहीं थी।',
  'error.speechUnsupported': 'इस ब्राउज़र में बोली पहचानने की सुविधा नहीं है। Chrome, Edge या Safari इस्तेमाल करें।',
  'error.micDenied': 'माइक्रोफ़ोन की अनुमति नहीं मिली। इस साइट के लिए माइक्रोफ़ोन चालू करें और फिर कोशिश करें।',
  'error.micMissing': 'कोई माइक्रोफ़ोन नहीं मिला। देख लें कि माइक्रोफ़ोन जुड़ा हुआ है, फिर कोशिश करें।',
  'error.speechNetwork': 'बोली पहचानने वाली सेवा में नेटवर्क की गड़बड़ी आ गई। अपना कनेक्शन देखें और फिर कोशिश करें।',

  // --- instant mode ------------------------------------------------------------
  'instant.working': 'आपका जवाब लिखा जा रहा है (कोई कुंजी नहीं)…',
  'instant.left': 'आज {n} मुफ़्त जवाब बाकी हैं',
  'instant.leftOne': 'आज 1 मुफ़्त जवाब बाकी है',
  'instant.done.title': 'आज के मुफ़्त जवाब खत्म हो गए',
  'instant.done.body':
    '{time} पर ये फिर से मिल जाएँगे। ज़्यादा जवाब रोज़ पाने के लिए साइन इन करें, या असीमित जवाबों के लिए अपनी खुद की API कुंजी जोड़ें — ऐसे जवाब जो कभी हमारे सर्वर तक नहीं पहुँचते।',
  'instant.done.byok': 'इसके बजाय अपनी खुद की API कुंजी इस्तेमाल करें',
  'instant.turnstile': 'पुष्टि नहीं हो सकी — पेज फिर से लोड करें और एक बार फिर कोशिश करें।',
  'instant.error': 'इंस्टेंट मोड अभी उपलब्ध नहीं है — थोड़ी देर बाद फिर कोशिश करें, या अपनी खुद की API कुंजी इस्तेमाल करें।',
  'instant.badge': 'इंस्टेंट मोड',

  // --- history ---------------------------------------------------------------
  'history.show': 'इतिहास',
  'history.hide': 'इतिहास छिपाएँ',
  'history.empty': 'अभी तक कोई जवाब सेव नहीं हुआ — जो भी जवाब आप बनाएँगे, वह यहाँ, इसी डिवाइस पर सेव हो जाएगा।',
  'history.localOnly': 'सिर्फ़ इस डिवाइस पर सेव है। इसे एन्क्रिप्ट होकर हर डिवाइस पर सिंक कराने के लिए साइन इन करें और अपना वॉल्ट खोलें।',
  'history.synced': 'एन्क्रिप्ट होकर आपके खाते में सिंक है। इसे सिर्फ़ आपके डिवाइस ही पढ़ सकते हैं।',
  'history.delete': 'यह एंट्री हटाएँ',
  'history.clear': 'पूरा इतिहास मिटाएँ',
  'history.clearConfirm': 'सारे सेव किए हुए जवाब हटा दें? सिंक की हुई कॉपी भी मिट जाएगी। इसे वापस नहीं लिया जा सकता।',
}

export default hi
