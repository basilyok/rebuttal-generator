// Per-language material for the PROMPTS, not the interface.
//
// This file exists because of a failure mode that is easy to miss: the
// constitution's reactance rule is enforced by banning specific phrases, and a
// banned-phrase list is language-specific. Ship the English list with a Spanish
// reply and the rule silently stops working — the model will write "debes" and
// "la realidad es que" without ever touching a forbidden English string, and the
// reply gets measurably more controlling in exactly the way CONSTITUTION.md rule 7
// exists to prevent.
//
// So every supported language has its own list of controlling and condescending
// constructions. These are equivalents in FORCE, not translations: what matters is
// that each entry is the phrasing a native speaker reads as bossy, superior, or
// corrective — not the literal rendering of the English words.
//
// The non-English entries were written by native-level review, and several capture
// traps that have no English counterpart at all: the German particle "doch" turns a
// statement into a rebuke with no equivalent to warn you; Korean's literal "you"
// (당신) reads as hostile in a private message; Arabic marks the addressee's gender
// on every verb, so guessing it is itself a mistake. Do not "simplify" these back
// toward the English list.

export interface PersuasionLocale {
  /** Language name in English, used inside the prompt itself */
  name: string
  /** Constructions that trigger reactance or read as condescension */
  banned: string[]
  /** What a writer of this language must decide that English never forces */
  note?: string
}

export const PERSUASION: Record<string, PersuasionLocale> = {
  en: {
    name: 'English',
    banned: [
      'you must',
      'you need to',
      'the fact is',
      'any reasonable person',
      'clearly',
      'obviously',
      'Actually,',
      'To be clear,',
      'Let me explain',
    ],
  },
  es: {
    name: 'Spanish',
    banned: [
      'debes',
      'tienes que entender',
      'la realidad es que',
      'está claro que',
      'es evidente que',
      'obviamente',
      'es de sentido común',
      'cualquiera con un mínimo de criterio',
      'En realidad,',
      'Déjame explicarte',
    ],
    note: 'Mirror their pronoun exactly — tú, vos (Río de la Plata and much of Central America) or usted — and never write vosotros unless they did, since outside Spain the plural is always ustedes. Bare imperatives and impersonal obligation ("hay que…") land far harder in Spanish than their English equivalents, so own the claim with the conditional or a first-person frame ("yo diría", "yo lo veo así") instead of instructing.',
  },
  fr: {
    name: 'French',
    banned: [
      'vous devez',
      'il faut comprendre que',
      'je vous rappelle que',
      "la réalité, c'est que",
      'tout le monde sait que',
      'de toute évidence',
      'En fait,',
      'Soyons clairs,',
      'Renseignez-vous',
      'Je vais vous expliquer',
    ],
    note: 'Match their "tu"/"vous" exactly — picking the other is itself a status move — and treat every banned form as equally banned in its tu equivalent ("tu dois", "je te rappelle que"). Avoid the politeness formulas that announce an attack ("avec tout le respect que je vous dois", "sauf votre respect", "permettez-moi de"): they read as contempt, not courtesy.',
  },
  de: {
    name: 'German',
    banned: [
      'du musst',
      'Sie müssen',
      'man muss doch',
      'Fakt ist',
      'Tatsache ist',
      'jeder vernünftige Mensch',
      'offensichtlich',
      'Das ist doch klar',
      'Da irrst du dich',
      'Ich erkläre dir das mal',
      'Nur damit das klar ist',
      'Das ist nun mal so',
    ],
    note: 'Match their "du"/"Sie" exactly and never switch mid-message — switching is itself a status move. Keep sentences short, because long subordinate chains read as a lecture. Above all avoid the particle "doch" in claims aimed at the reader ("Das ist doch klar", "Du weißt doch"): it silently turns a statement into a rebuke, and English has no equivalent to warn you.',
  },
  'pt-BR': {
    name: 'Brazilian Portuguese',
    banned: [
      'você tem que',
      'você deveria',
      'você precisa entender',
      'a verdade é que',
      'qualquer pessoa com o mínimo de bom senso',
      'é óbvio que',
      'Na verdade,',
      'Só pra deixar claro,',
      'Deixa eu te explicar',
      'com todo o respeito',
    ],
    note: 'Use "você" throughout — in Brazil it is the neutral default, not familiar. Only use "tu" if they did (it is regional), and never shift to "o senhor"/"a senhora" mid-message: the jump in formality reads as sarcasm or as deliberately putting distance between you.',
  },
  it: {
    name: 'Italian',
    banned: [
      'devi capire che',
      'è un dato di fatto',
      'chiunque abbia un minimo di buonsenso',
      'ovviamente',
      'banalmente',
      'In realtà,',
      'Sia chiaro,',
      'Guarda che',
      'Ti spiego una cosa',
      'basta informarsi',
    ],
    note: 'Match their "tu"/"Lei" exactly and never switch mid-message — moving to "Lei" reads as cold distancing, moving to "tu" as taking a liberty (Lei pronouns are capitalised: Lei, La, Le, Suo). Italian has a softener English lacks: the impersonal "si" ("si tende a pensare che…", "si legge spesso che…") contests a claim without pointing at the person, and should be preferred over any second-person correction.',
  },
  ja: {
    name: 'Japanese',
    banned: [
      'すべきです',
      'しなければなりません',
      '勘違いされているようですが',
      'ご存じないかもしれませんが',
      '常識的に考えて',
      '言うまでもなく',
      'そもそも',
      '冷静に考えれば',
      'はっきり言って',
      '教えてあげますが',
    ],
    note: 'Match their politeness level (です・ます vs plain form) exactly — dropping to plain form when they wrote です・ます reads as a deliberate slight, and piling on 敬語 above their level reads as sarcastic distance. Avoid 「あなた」 almost entirely: Japanese normally drops the subject, and a repeated 「あなた」 sounds accusatory, so use their name + さん or no subject at all. Do not stack 「〜のです / 〜んです」 explanatory endings — one is fine, three in a row is the grammar of explaining something to a child.',
  },
  ko: {
    name: 'Korean',
    banned: [
      '하셔야 합니다',
      '아셔야 합니다',
      '잘못 알고 계십니다',
      '오해하고 계신 것 같습니다',
      '설명해 드리자면',
      '분명히 말씀드리자면',
      '엄연한 사실입니다',
      '상식적으로 생각하면',
      '누가 봐도',
      '당연히 아시겠지만',
    ],
    note: "Never write '당신' — Korean's literal 'you' reads as cold, distancing or openly hostile in a private message. Drop the subject entirely (Korean does this naturally) or use their name and title. Match their speech level (해요체 vs 합니다체) exactly and keep the honorific -시- on verbs whose subject is them; dropping either mid-message is read as an insult before the argument is even considered.",
  },
  'zh-Hans': {
    name: 'Simplified Chinese',
    banned: [
      '你必须',
      '你应该',
      '你要明白',
      '你不得不承认',
      '事实恰恰相反',
      '难道你',
      '众所周知',
      '很明显',
      '但凡有点常识',
      '给你科普',
    ],
    note: 'Match their 你/您 exactly and default to 你 — 您 aimed at a peer or family member reads as cold distance or outright sarcasm, not respect. Hedge with 我觉得 and sentence-final 吧/呢, because a bare Chinese declarative lands much harder than the same sentence in English. Keep 成语-heavy 书面语 out of a personal message: that register by itself reads as 说教.',
  },
  ar: {
    name: 'Arabic',
    banned: [
      'يجب عليك',
      'عليك أن تدرك',
      'الحقيقة أن',
      'لا شك أن',
      'من الواضح أن',
      'من البديهي أن',
      'لا يخفى على أحد',
      'أي شخص عاقل',
      'دعني أشرح لك',
      'يا عزيزي',
    ],
    note: 'Arabic marks the addressee for gender — أنتَ vs أنتِ, with every verb and adjective agreeing — so if the recipient\'s gender is not clear from the argument, use impersonal or nominal constructions rather than defaulting to masculine. Keep the prose in plain modern MSA: ornate classical register (rhymed cadence, إنّ-fronted declarations, piled rhetorical questions) reads as a khutba and is the fastest way to sound like you are lecturing rather than talking.',
  },
  hi: {
    name: 'Hindi',
    banned: [
      'आपको समझना चाहिए',
      'मैं आपको समझाता हूँ',
      'आप समझ नहीं रहे हैं',
      'आपकी जानकारी के लिए बता दूँ',
      'आपको मानना पड़ेगा',
      'सच तो यह है कि',
      'कोई भी समझदार व्यक्ति',
      'ज़ाहिर सी बात है',
      'यह तो बच्चा भी जानता है',
      'दरअसल,',
    ],
    note: 'Default to आप and mirror exactly what they used (आप/तुम/तू) and the script they wrote in (Devanagari vs Roman Hinglish) — a switch in either is read as a status move before the argument is read at all. Avoid the समझाना frame ("मैं समझाता हूँ", "समझ लीजिए"), which casts the writer as teacher, and avoid bare-stem imperatives (समझो, देखो, मानो) plus Sanskritised officialese; prefer owning the claim ("मुझे लगता है…", "मेरी समझ यह है कि…").',
  },
  el: {
    name: 'Greek',
    banned: [
      'πρέπει να καταλάβεις',
      'είναι γεγονός ότι',
      'είναι ξεκάθαρο ότι',
      'προφανώς',
      'όποιος έχει στοιχειώδη λογική',
      'μάλλον δεν κατάλαβες',
      'όπως θα έπρεπε να ξέρεις',
      'Ας ξεκαθαρίσουμε κάτι',
      'Άσε με να σου εξηγήσω',
      'αγαπητέ μου',
    ],
    note: 'Match their εσύ/εσείς exactly — switching to εσείς mid-thread reads as cold distancing, and εσύ toward someone who wrote formally reads as presumptuous. Avoid καθαρεύουσα-flavoured vocabulary (οφείλω, εν προκειμένω, ουδόλως), which lands as a lecture rather than as precision, and never attach μου to a vocative (φίλε μου, αγαπητέ μου): inside a disagreement it is read as sarcasm regardless of intent.',
  },
}

export const persuasionFor = (language: string): PersuasionLocale => PERSUASION[language] || PERSUASION.en
