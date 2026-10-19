import * as G from "@/lib/islamic/glossary"
/**
 * Everyday duas from the Quran and authentic Sunnah — the master library (founder, 19/10/2026: one vetted upgrade, no
 * word-for-word Khmer). Arabic as narrated; "phonetic" is a hyphenated Khmer-script reading aid (Cham Muslims in
 * Cambodia read Arabic in many ways, so it approximates rather than replaces learning the Arabic); km / en are the
 * meaning. Hadith numbers follow sunnah.com.
 *
 * Three meanings, three places:
 *   • `poster` — on graphics: reverent, natural Khmer, NO parentheses (posterMeaning; duas.test.ts enforces it);
 *   • `km` — the full meaning, in the app and the Telegram caption (it may explain in parentheses);
 *   • `note` — background for the caption only («ℹ️ បញ្ជាក់៖ …»), never on a poster.
 */

export type Dua = {
  id: string
  /** When it is said. */
  title: { km: string; en: string }
  arabic: string
  phonetic: string
  latin: string
  /** The full meaning (the app, the caption). */
  km: string
  en: string
  source: string
  /** The poster's meaning, no parentheses; the full meaning without them when absent. */
  poster?: string
  /** A caption-only explanation. */
  note?: string
}

export const DUAS: Dua[] = [
  {
    id: "wake",
    title: { km: "ឌុអាពេលភ្ញាក់ពីគេង", en: "On waking up" },
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
    phonetic: "អាល់-ហាំ-ឌុ លិល-ឡា-ហ៊ីល-ឡាហ្ស៊ី អាហ៍-យ៉ា-ណា បាអ៊-ដា ម៉ា អា-ម៉ា-តា-ណា វ៉ា-អ៊ី-ឡៃ-ហ៊ីន-នុ-ស៊ូរ",
    latin: "Al-ḥamdu lillāhil-ladhī aḥyānā ba‘da mā amātanā wa ilayhin-nushūr",
    km: "រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ ដែលទ្រង់បានប្រទានជីវិតឱ្យពួកយើងរស់ឡើងវិញ ក្រោយពីការលង់លក់។",
    poster: "« រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ ដែលទ្រង់បានប្រទានជីវិតឱ្យពួកយើងរស់ឡើងវិញ ក្រោយពីការលង់លក់។ »",
    en: "All praise is for Allah who gave us life after causing us to die (sleep), and to Him is the resurrection.",
    source: "Sahih al-Bukhari 6312",
  },
  {
    id: "leave-home",
    title: { km: "ឌុអាចេញពីផ្ទះ", en: "Leaving home" },
    arabic: "بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
    phonetic: "ប៊ីស-មីល-ឡោះ, តា-វ៉ាក់-កាល់-ទុ អា-ឡាល់-ឡោះ, វ៉ា-ឡា ហាវ-ឡា វ៉ា-ឡា កូវ-វ៉ា-តា អ៊ីល-ឡា ប៊ីល-ឡោះ",
    latin: "Bismillāh, tawakkaltu ‘alallāh, wa lā ḥawla wa lā quwwata illā billāh",
    km: "ដោយព្រះនាមអល់ឡោះ ទូលបង្គំសូមផ្ញើការទុកចិត្តទាំងស្រុងលើអល់ឡោះ ហើយគ្មានអំណាច ឬកម្លាំងណាមួយឡើយ ក្រៅពីការជួយជ្រោមជ្រែងពីទ្រង់។",
    poster: "« ដោយព្រះនាមអល់ឡោះ ទូលបង្គំសូមផ្ញើការទុកចិត្តទាំងស្រុងលើអល់ឡោះ ហើយគ្មានអំណាច ឬកម្លាំងណាមួយឡើយ ក្រៅពីការជួយជ្រោមជ្រែងពីទ្រង់។ »",
    en: "In the name of Allah, I place my trust in Allah; there is no might nor power except with Allah.",
    source: "Sunan Abi Dawud 5095",
  },
  {
    id: "enter-mosque",
    title: { km: "ឌុអាចូលវិហារឥស្លាម", en: "Entering the mosque" },
    arabic: "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
    phonetic: "អាល់-ឡា-ហ៊ុម្ម៉ាហ្វ-តះហ៍ លី អាប-វ៉ា-បា រ៉ស់ហ៍-ម៉ា-ទីក",
    latin: "Allāhummaftaḥ lī abwāba raḥmatik",
    km: "ឱអល់ឡោះ! សូមទ្រង់មេត្តាបើកទ្វារនៃក្តីមេត្តាករុណារបស់ទ្រង់ដល់រូបទូលបង្គំ។",
    poster: "« ឱអល់ឡោះ! សូមទ្រង់មេត្តាបើកទ្វារនៃក្តីមេត្តាករុណារបស់ទ្រង់ដល់រូបទូលបង្គំ។ »",
    en: "O Allah, open for me the doors of Your mercy.",
    source: "Sahih Muslim 713",
  },
  {
    id: "leave-mosque",
    title: { km: "ឌុអាចេញពីវិហារឥស្លាម", en: "Leaving the mosque" },
    arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
    phonetic: "អាល់-ឡា-ហ៊ុម្ម៉ា អ៊ិន-នី អាស-អា-លុ-កា មីន ហ្វាត់-លីក",
    latin: "Allāhumma innī as’aluka min faḍlik",
    km: "ឱអល់ឡោះ! ទូលបង្គំសូមអង្វរករនូវសេចក្តីសប្បុរស និងពរជ័យពីទ្រង់។",
    poster: "« ឱអល់ឡោះ! ទូលបង្គំសូមអង្វរករនូវសេចក្តីសប្បុរស និងពរជ័យពីទ្រង់។ »",
    en: "O Allah, I ask You of Your bounty.",
    source: "Sahih Muslim 713",
  },
  {
    id: "before-eating",
    title: { km: "ឌុអាមុនទទួលទានអាហារ", en: "Before eating" },
    arabic: "بِسْمِ اللَّهِ",
    phonetic: "ប៊ីស-មីល-ឡោះ",
    latin: "Bismillāh",
    km: "ដោយព្រះនាមអល់ឡោះ។",
    poster: "« ដោយព្រះនាមអល់ឡោះ »",
    note: "បើភ្លេចសូត្រនៅដើម សូមសូត្រពេលនឹកឃើញ៖ ប៊ីស-មីល-ឡា-ហ៊ី អាវ-វ៉ា-ឡា-ហ៊ូ វ៉ា-អា-ខិ-រ៉ា-ហ៊ូ — ដោយព្រះនាមអល់ឡោះ ទាំងនៅដើម និងនៅចុង។",
    en: "In the name of Allah. (If you forgot at the start: Bismillāhi awwalahu wa ākhirah — in the name of Allah, at its beginning and its end.)",
    source: "Sahih al-Bukhari 5376 · Sunan Abi Dawud 3767",
  },
  {
    id: "after-eating",
    title: { km: "ឌុអាក្រោយទទួលទានអាហារ", en: "After eating" },
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ",
    phonetic: "អាល់-ហាំ-ឌុ លិល-ឡា-ហ៊ីល-ឡាហ្ស៊ី អាត់-អា-ម៉ា-ណា វ៉ា-សា-កា-ណា វ៉ា-ចា-អា-ឡា-ណា មូស-លី-មីន",
    latin: "Al-ḥamdu lillāhil-ladhī aṭ‘amanā wa saqānā wa ja‘alanā muslimīn",
    km: "រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ ដែលទ្រង់បានប្រទានអាហារ ភេសជ្ជៈ និងបានកំណត់ឱ្យពួកយើងក្លាយជាអ្នកកាន់សាសនាឥស្លាម។",
    poster: "« រាល់ការសរសើរ និងអរគុណយ៉ាងជ្រាលជ្រៅបំផុតគឺចំពោះអល់ឡោះ ដែលទ្រង់បានប្រទានអាហារ ភេសជ្ជៈ និងបានកំណត់ឱ្យពួកយើងក្លាយជាអ្នកកាន់សាសនាឥស្លាម។ »",
    en: "All praise is for Allah who fed us, gave us drink and made us Muslims.",
    source: "Sunan Abi Dawud 3850 · Jami' at-Tirmidhi 3457",
  },
  {
    id: "halal-provision",
    title: { km: "សុំលាភហាឡាល់ និងរួចពីបំណុល", en: "For halal provision and freedom from debt" },
    arabic: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ",
    phonetic: "អាល់ឡោហុំម៉ាក់ហ្វិនី ប៊ិហាឡាលិកា អាន់ ហារ៉ាមិកា វ៉ាអាហ្កនិនី ប៊ិហ្វាឌលិកា អាំម៉ាន់ ស៊ីវ៉ាក",
    latin: "Allāhummakfinī bi-ḥalālika ‘an ḥarāmik, wa aghninī bi-faḍlika ‘amman siwāk",
    km: "ឱអល់ឡោះ សូមឲ្យរបស់ហាឡាល់របស់ព្រះអង្គគ្រប់គ្រាន់សម្រាប់ខ្ញុំ ដោយមិនត្រូវការរបស់ហារ៉ាម ហើយសូមឲ្យខ្ញុំមានគ្រប់គ្រាន់ដោយការប្រោសប្រទានរបស់ព្រះអង្គ ដោយមិនពឹងលើអ្នកណាក្រៅពីព្រះអង្គ។",
    en: "O Allah, suffice me with what You have made lawful instead of what You have forbidden, and make me independent by Your bounty of all besides You.",
    source: "Jami' at-Tirmidhi 3563",
  },
  {
    id: "worry-debt",
    title: { km: "ពេលព្រួយបារម្ភ និងមានបំណុល", en: "In worry and debt" },
    arabic: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ",
    phonetic: "អាល់ឡោហុំម៉ា អ៊ិន្នី អាអ៊ូហ្សុ ប៊ិកា មិណាល់ ហាំមិ វ៉ាល់ ហាហ្សានិ វ៉ាល់ អាជហ្សិ វ៉ាល់ កាសាលិ វ៉ាល់ ជុបនិ វ៉ាល់ ប៊ុខលិ វ៉ា ឌ្វាឡាអ៊ិដ ដៃនិ វ៉ា ហ្កាឡាបាទិរ រីជាល",
    latin: "Allāhumma innī a‘ūdhu bika minal-hammi wal-ḥazan, wal-‘ajzi wal-kasal, wal-jubni wal-bukhl, wa ḍala‘id-dayni wa ghalabatir-rijāl",
    km: "ឱអល់ឡោះ ខ្ញុំសុំការការពារពីព្រះអង្គ ពីការព្រួយបារម្ភ និងទុក្ខសោក ពីភាពអស់សមត្ថភាព និងខ្ជិលច្រអូស ពីភាពកំសាក និងកំណាញ់ ពីបន្ទុកបំណុល និងការត្រួតត្រារបស់មនុស្ស។",
    en: "O Allah, I seek refuge in You from worry and grief, from incapacity and laziness, from cowardice and miserliness, from the burden of debt and from being overpowered by men.",
    source: "Sahih al-Bukhari 6369",
  },
  {
    id: "distress",
    title: { km: "ឌុអាពេលជួបការលំបាក ឬទុក្ខព្រួយ", en: "In hardship or distress" },
    // The du'a of Prophet Yunus in the whale (founder, 19/10/2026): Al-Anbiya 21:87; its virtue in Jami' at-Tirmidhi 3505.
    arabic: "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
    phonetic: "ឡា អ៊ី-ឡា-ហា អ៊ីល-ឡា អាន់-តា ស៊ុប-ហា-ណា-កា អ៊ិន-នី គុន-ទុ មី-ណាស់ ហ្ស-លី-មីន",
    latin: "Lā ilāha illā anta subḥānaka innī kuntu minaẓ-ẓālimīn",
    km: "គ្មានព្រះឯណាដែលត្រូវគោរពសក្ការៈពិតប្រាកដក្រៅពីទ្រង់ឡើយ! មហាស្អាតស្អំ និងមហាបរិសុទ្ធបំផុតគឺទ្រង់ ហើយពិតប្រាកដណាស់ ទូលបង្គំជាអ្នកដែលបានប្រព្រឹត្តកំហុសឆ្គង។",
    poster: "« គ្មានព្រះឯណាដែលត្រូវគោរពសក្ការៈពិតប្រាកដក្រៅពីទ្រង់ឡើយ! មហាស្អាតស្អំ និងមហាបរិសុទ្ធបំផុតគឺទ្រង់ ហើយពិតប្រាកដណាស់ ទូលបង្គំជាអ្នកដែលបានប្រព្រឹត្តកំហុសឆ្គង។ »",
    en: "There is no god but You; glory be to You; truly I have been among the wrongdoers.",
    source: "Al-Anbiya 21:87 · Jami' at-Tirmidhi 3505",
  },
  {
    id: "fast-niyyah",
    title: { km: "ការតាំងចិត្តបួស (នៀតបួស)", en: "Intention to fast (niyyah)" },
    // The Shafi'i formula for Ramadan. The intention itself is in the heart; for a sunnah fast one intends that fast
    // instead. Not a hadith text — its source line says so.
    arabic: "نَوَيْتُ صَوْمَ غَدٍ عَنْ أَدَاءِ فَرْضِ شَهْرِ رَمَضَانَ هَذِهِ السَّنَةِ لِلَّهِ تَعَالَى",
    phonetic: "ណា-វ៉ៃ-តុ សោវ-ម៉ា ហ្កា-ឌិន អាន់ អា-ដា-អ៊ិ ហ្វាដ-ឌិ ស្យាហ្រ-រិ រ៉ា-ម៉ា-ដន ហា-ហ្ស៊ិ-ហិស សា-ណា-ទិ លិល-ឡា-ហិ តា-អា-ឡា",
    latin: "Nawaitu ṣawma ghadin ‘an adā’i farḍi shahri Ramaḍāna hādhihis-sanati lillāhi ta‘ālā",
    km: "ខ្ញុំតាំងចិត្តបួសនៅថ្ងៃស្អែក ដើម្បីបំពេញកាតព្វកិច្ច (ខែរ៉ាម៉ាឌន / ស៊ុណ្ណា) ដើម្បីអល់ឡោះជាម្ចាស់ ﷻ។",
    // No parentheses on a graphic: «ខែរ៉ាម៉ាឌន ឬបួសស៊ុណ្ណា».
    poster: `« ខ្ញុំតាំងចិត្តបួសនៅថ្ងៃស្អែក ដើម្បីបំពេញកាតព្វកិច្ចខែរ៉ាម៉ាឌន ឬ${G.SUNNAH_FAST} ដើម្បីអល់ឡោះជាម្ចាស់ ﷻ។ »`,
    note: `ការតាំងចិត្ត (${G.NIYYAH}) គឺនៅក្នុងចិត្ត — ការសូត្រជាពាក្យ គឺជាការអនុវត្តតាមមាសហាប់សាហ្វីអ៊ី។ សម្រាប់${G.SUNNAH_FAST} សូមតាំងចិត្តសម្រាប់ការបួសនោះ។`,
    en: "I intend to fast tomorrow to fulfil the obligation of this year's Ramadan, for Allah the Exalted. (For a sunnah fast, intend that fast instead.)",
    source: "Niyyah — the Shafi'i formula; the intention is in the heart (Sahih al-Bukhari 1)",
  },
  {
    id: "iftar",
    title: { km: `ឌុអា${G.IFTAR}`, en: "Breaking the fast (iftar)" },
    arabic: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ",
    phonetic: "ហ្សា-ហា-បា អាស-ហ្សា-ម៉ា-អ៊ុ, វ៉ា-អ៊ីប-តាល់-ឡា-ទីល អ៊ុ-រូ-ក, វ៉ា-សា-បា-តាល់ អាជ-រុ, អ៊ីន-ស្យា-អល់-ឡោះ",
    latin: "Dhahabaẓ-ẓama’u wabtallatil-‘urūqu wa thabatal-ajru in shā’ Allāh",
    km: "ភាពស្រេកទឹកបានរសាយបាត់ សរសៃឈាមទាំងឡាយបានទទួលសំណើមឡើងវិញ ហើយផលបុណ្យកុសលត្រូវបានបញ្ជាក់ជាប្រាកដ ប្រសិនបើអល់ឡោះទ្រង់សព្វព្រះទ័យ។",
    poster: "« ភាពស្រេកទឹកបានរសាយបាត់ សរសៃឈាមទាំងឡាយបានទទួលសំណើមឡើងវិញ ហើយផលបុណ្យកុសលត្រូវបានបញ្ជាក់ជាប្រាកដ ប្រសិនបើអល់ឡោះទ្រង់សព្វព្រះទ័យ។ »",
    en: "The thirst has gone, the veins are moistened, and the reward is certain, if Allah wills.",
    source: "Sunan Abi Dawud 2357",
  },
  {
    id: "travel",
    title: { km: "ឌុអាពេលធ្វើដំណើរ", en: "Setting out on a journey" },
    arabic: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ",
    phonetic: "ស៊ុប-ហា-ណាល់-ឡាហ្ស៊ី សាក់-ខរ៉ូ ឡា-ណា ហា-ហ៊្សា វ៉ា-ម៉ា គុណ្-ណា ឡា-ហ៊ុ មូក-រី-នីន, វ៉ា-អ៊ីន-ណា អ៊ី-ឡា រ៉ប-ពី-ណា ឡា-មុន-កល់-លី-ប៊ូន",
    latin: "Subḥānal-ladhī sakhkhara lanā hādhā wa mā kunnā lahu muqrinīn, wa innā ilā rabbinā lamunqalibūn",
    km: "មហាស្អាតស្អំ និងមហាបរិសុទ្ធបំផុតគឺអល់ឡោះ ដែលទ្រង់បានប្រទានយានជំនិះនេះជាប្រយោជន៍ដល់ពួកយើង ខណៈដែលពួកយើងគ្មានលទ្ធភាពបញ្ជាវាដោយខ្លួនឯងបានឡើយ ហើយពិតប្រាកដណាស់ ពួកយើងនឹងត្រូវវិលត្រឡប់ទៅកាន់ម្ចាស់របស់យើងវិញ។",
    poster: "« មហាស្អាតស្អំ និងមហាបរិសុទ្ធបំផុតគឺអល់ឡោះ ដែលទ្រង់បានប្រទានយានជំនិះនេះជាប្រយោជន៍ដល់ពួកយើង ហើយពិតប្រាកដណាស់ ពួកយើងនឹងត្រូវវិលត្រឡប់ទៅកាន់ម្ចាស់របស់យើងវិញ។ »",
    en: "Glory be to the One who has subjected this to us, though we could never have done so ourselves; and surely to our Lord we shall return.",
    source: "Az-Zukhruf 43:13–14 · Sahih Muslim 1342",
  },
  {
    id: "both-worlds",
    title: { km: "សុំសេចក្ដីល្អក្នុងលោកទាំងពីរ", en: "Good in both worlds" },
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    phonetic: "រ៉ប្បាណា អាទិណា ហ្វិដ ឌុនយ៉ា ហាសាណាតាន់ វ៉ាហ្វិល អាខិរ៉ាទិ ហាសាណាតាន់ វ៉ាគិណា អាហ្សាបាន់ណារ",
    latin: "Rabbanā ātinā fid-dunyā ḥasanatan wa fil-ākhirati ḥasanatan wa qinā ‘adhāban-nār",
    km: "ឱព្រះជាម្ចាស់នៃយើង សូមប្រទានដល់យើងនូវសេចក្ដីល្អក្នុងលោកនេះ និងសេចក្ដីល្អក្នុងលោកខាងមុខ ហើយសូមការពារយើងពីទារុណកម្មនៃភ្លើងនរក។",
    en: "Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire.",
    source: "Al-Baqarah 2:201",
  },
  {
    id: "sleep",
    title: { km: "ឌុអាមុនចូលគេង", en: "Before sleeping" },
    arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
    phonetic: "ប៊ីស-មី-កា អាល់-ឡា-ហ៊ុម្ម៉ា អា-មូ-ទុ វ៉ា-អាហ៍-យ៉ា",
    latin: "Bismika Allāhumma amūtu wa aḥyā",
    km: "« ឱអល់ឡោះ! ដោយព្រះនាមទ្រង់ ទូលបង្គំលង់លក់ (ស្លាប់) និងភ្ញាក់ដឹងខ្លួនឡើងវិញ (រស់)។ »",
    poster: "« ឱអល់ឡោះ! ដោយព្រះនាមទ្រង់ ទូលបង្គំលង់លក់ និងភ្ញាក់ដឹងខ្លួនឡើងវិញ។ »",
    note: "ក្នុងសាសនាឥស្លាម ដំណេកត្រូវបានចាត់ទុកជាការស្លាប់តូចមួយ ហើយការភ្ញាក់ដឹងខ្លួន គឺជាការប្រទានជីវិតរស់ឡើងវិញពីអល់ឡោះ ﷻ",
    en: "In Your name, O Allah, I die and I live.",
    source: "Sahih al-Bukhari 6312",
  },
]

/** The meaning for a graphic: the poster version (never parentheses), else the full meaning. */
export const posterMeaning = (d: Dua) => d.poster ?? d.km
